import { findOwnershipConflicts } from '../roles/build.js'
import type { Config } from '../schema/config.js'
import type { Team } from '../schema/role.js'
import type { Board, BoardEntry, Story } from '../schema/work.js'

/**
 * Deciding who actually starts work, and refusing to start anyone who would collide.
 *
 * The checks here come from the Agent Teams guidance and from what goes wrong in
 * practice: two seats owning one path, a story nobody can finish because it has no
 * acceptance criteria, and more seats running at once than anyone can coordinate.
 */

export interface DepartmentInput {
  team: Team
  config: Config
  board: Board
  /** Stories for the tasks being handed out, keyed by id. */
  stories: Record<string, Pick<Story, 'files' | 'acceptance' | 'deliverables' | 'verify' | 'owner'>>
  /** Which phase the project is in, for `when:` guards on seats. */
  phase?: string
  /** Seats already working, which count against the active limit. */
  running?: string[]
}

export interface SeatPlan {
  seat: string
  /** Tasks this seat would be given, in order. */
  tasks: BoardEntry[]
  /** Why this seat is not starting, when it is not. */
  held?: string
}

export interface Problem {
  /** Blocks the dispatch. */
  severity: 'block' | 'warn'
  message: string
  fix?: string
}

export interface DepartmentPlan {
  active: SeatPlan[]
  held: SeatPlan[]
  problems: Problem[]
  /** True when nothing blocks. */
  ok: boolean
}

/** Does a seat's `when:` guard admit this phase? `phase in [build, verify]`. */
export function guardAdmits(when: string | undefined, phase: string | undefined): boolean {
  if (!when) return true
  const match = /^phase\s+in\s*\[([^\]]*)\]$/.exec(when.trim())
  if (!match) return true // An unreadable guard is not a reason to refuse to work.
  if (!phase) return false
  const allowed = (match[1] ?? '').split(',').map((p) => p.trim())
  return allowed.includes(phase)
}

export interface StoryScope {
  files?: string[] | undefined
  acceptance?: string[] | undefined
  verify?: string | undefined
}

/**
 * The checks every dispatch owes, whoever is doing the dispatching.
 *
 * These used to live inside `planDepartment`, which meant `delphi dept up` ran them and
 * `delphi dispatch` ran none. That is how two stories came to claim the same file and two
 * seats were started on it: one of them deleted the other's work, and nothing had objected
 * (C-018). A single-seat dispatch is still a dispatch.
 *
 * The collision check is the important one. The rest is what a seat needs to do the job at
 * all: what "done" means, and which files are its own.
 */
export function checkStories(stories: Record<string, StoryScope>): Problem[] {
  const problems: Problem[] = []

  // Two stories in the same shift claiming the same file is the collision the ownership
  // rule exists to prevent — the seats are distinct but the work still lands on one path.
  const claims = new Map<string, string[]>()
  for (const [id, story] of Object.entries(stories)) {
    for (const glob of story.files ?? []) {
      claims.set(glob, [...(claims.get(glob) ?? []), id])
    }
  }
  for (const [glob, ids] of claims) {
    if (ids.length > 1) {
      problems.push({
        severity: 'block',
        message: `stories ${ids.join(' and ')} both claim ${glob}`,
        fix: 'split the work so each story owns its own files',
      })
    }
  }

  for (const [id, story] of Object.entries(stories)) {
    if ((story.acceptance ?? []).length === 0) {
      problems.push({
        severity: 'block',
        message: `${id} has no acceptance criteria`,
        fix: 'a seat cannot tell when it is finished; write them before dispatching',
      })
    }
    if ((story.files ?? []).length === 0) {
      problems.push({
        severity: 'block',
        message: `${id} does not say which files it owns`,
        fix: 'without it, nothing stops two seats editing the same code',
      })
    }
    if (!story.verify) {
      problems.push({
        severity: 'warn',
        message: `${id} has no verify command`,
        fix: 'the seat will have nothing to paste as evidence',
      })
    }
  }

  return problems
}

/**
 * Every seat is told to read `docs/project-context.md` before it starts anything.
 *
 * When that file is still the template it shipped as, each seat spends its opening tokens on
 * angle brackets and then works from the story alone — which is exactly what two seats
 * reported doing on the first real run. A warning, not a block: a department can work
 * without it, it just works with less.
 */
export function checkProjectContext(text: string): Problem[] {
  const placeholders = text.split('\n').filter((line) => /^<[^>]*>$/.test(line.trim())).length
  if (placeholders === 0) return []

  return [
    {
      severity: 'warn',
      message: `docs/project-context.md is still the template (${placeholders} unfilled ${placeholders === 1 ? 'line' : 'lines'})`,
      fix: 'every seat you start is told to read it first; fill it, or they work from the story alone',
    },
  ]
}

export function planDepartment(input: DepartmentInput): DepartmentPlan {
  const problems: Problem[] = []
  const running = new Set(input.running ?? [])

  const conflicts = findOwnershipConflicts(input.config.seats)
  for (const conflict of conflicts) {
    problems.push({
      severity: 'block',
      message: `${conflict.seats.join(' and ')} both own ${conflict.glob}`,
      fix: 'give the path to one seat in .delphi/config.yaml',
    })
  }

  problems.push(...checkStories(input.stories))

  const byOwner = new Map<string, BoardEntry[]>()
  for (const task of input.board.tasks) {
    if (task.status !== 'ready' && task.status !== 'doing') continue
    byOwner.set(task.owner, [...(byOwner.get(task.owner) ?? []), task])
  }

  const eligible: SeatPlan[] = []
  const held: SeatPlan[] = []

  for (const member of input.team.seats) {
    if (member.seat === 'orchestrator') continue
    const tasks = byOwner.get(member.seat) ?? []

    if (!guardAdmits(member.when, input.phase)) {
      held.push({ seat: member.seat, tasks, held: `waits for ${member.when}` })
      continue
    }
    if (tasks.length === 0) {
      held.push({ seat: member.seat, tasks, held: 'nothing assigned to it yet' })
      continue
    }
    eligible.push({ seat: member.seat, tasks })
  }

  // Three to five active seats coordinate well. Past that they spend the shift on each
  // other, so the rest wait rather than all starting at once.
  const limit = Math.min(input.team.limits.max_active, input.config.dispatch.max_active)
  const budget = Math.max(0, limit - running.size)
  const active = eligible.slice(0, budget)
  for (const plan of eligible.slice(budget)) {
    held.push({ ...plan, held: `over the active limit of ${limit}` })
  }

  if (eligible.length > budget) {
    problems.push({
      severity: 'warn',
      message: `${eligible.length} seats have work but only ${budget} can start`,
      fix: 'the rest start as others finish',
    })
  }

  return { active, held, problems, ok: !problems.some((p) => p.severity === 'block') }
}

/**
 * The standard spawn prompt (ORCHESTRATION_SPEC section 4).
 *
 * The same text in every mode, so a seat behaves the same whether it was started as a
 * teammate, a background session, or by a person pasting it into Claude Desktop.
 */
export function spawnPrompt(input: {
  seat: string
  team: string
  slug: string
  taskId: string
  title: string
  files: string[]
  deliverables: string[]
  acceptance: string[]
  verify?: string | undefined
  attachments?: string[]
  reportTo?: string
  handoffTo?: string | undefined
}): string {
  const lines = [
    `You are @${input.seat} in the "${input.team}" department on project ${input.slug}.`,
    `Your role definition is loaded. The protocol is .delphi/PROTOCOL.md.`,
    `Task: ${input.taskId} — ${input.title}.`,
    `Read first: .delphi/projects/${input.slug}/stories/${input.taskId}.md, docs/project-context.md,` +
      ` .delphi/projects/${input.slug}/knowledge/${input.seat}.md if it exists.`,
    `Change only: ${input.files.join(', ') || '(the story lists no files — ask the orchestrator before writing)'}.`,
    'Anything outside that belongs to another seat: message them, do not edit it.',
  ]

  if (input.deliverables.length > 0) lines.push(`Deliver: ${input.deliverables.join(', ')}.`)
  lines.push(`Done when: ${input.acceptance.join(' · ')}.`)
  if (input.verify) lines.push(`Prove it with: ${input.verify} — keep the output for your report.`)
  if (input.attachments?.length) lines.push(`Attachments: ${input.attachments.join(', ')}.`)
  if (input.handoffTo) lines.push(`When you finish, hand over to @${input.handoffTo}.`)

  lines.push(
    `Report to @${input.reportTo ?? 'orchestrator'} in the Report Contract shape.`,
    'If the same cause blocks you twice, stop and report BLOCKED rather than trying a third time.',
  )
  return lines.join('\n')
}
