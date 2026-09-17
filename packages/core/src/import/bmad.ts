import matter from 'gray-matter'
import { parse } from 'yaml'
import type { BoardEntry, TaskStatus } from '../schema/work.js'

/**
 * Read artifacts a BMAD-METHOD project already has, and map them onto a delphi ledger.
 *
 * This reads **the user's own documents** — their PRD, their architecture, their epics,
 * their sprint status. It copies no prompts, no templates and no agent definitions from
 * that project, and it does not use its name for anything but this compatibility note.
 *
 * It is deliberately conservative: it reports what it recognised and what it did not,
 * rather than guessing at a shape it has not seen. An import that silently invents half a
 * board is worse than one that says "I found a PRD and nothing else".
 */

export interface BmadSource {
  /** File contents, keyed by path relative to the project root, forward slashes. */
  files: Record<string, string>
}

export interface BmadFinding {
  path: string
  kind: 'prd' | 'architecture' | 'epic' | 'story' | 'sprint-status'
  title: string
}

export interface BmadImport {
  findings: BmadFinding[]
  /** Suggested BRIEF.md content, or null when there was no PRD to build it from. */
  brief: string | null
  /** Board entries derived from epics and sprint status. */
  tasks: BoardEntry[]
  /** What was seen but not understood, so the user can decide rather than wonder. */
  unrecognised: string[]
  notes: string[]
}

/** The places these artifacts are conventionally kept. */
const PATTERNS: Array<{ test: RegExp; kind: BmadFinding['kind'] }> = [
  { test: /(^|\/)prd\.md$/i, kind: 'prd' },
  { test: /(^|\/)architecture\.md$/i, kind: 'architecture' },
  { test: /(^|\/)epics?\/[^/]+\.md$/i, kind: 'epic' },
  { test: /(^|\/)stories\/[^/]+\.md$/i, kind: 'story' },
  { test: /(^|\/)sprint[-_]status\.(ya?ml|json)$/i, kind: 'sprint-status' },
]

/** BMAD status names, mapped onto delphi's board. Anything unknown becomes `backlog`. */
const STATUS_MAP: Record<string, TaskStatus> = {
  todo: 'backlog',
  backlog: 'backlog',
  planned: 'backlog',
  ready: 'ready',
  approved: 'ready',
  'in-progress': 'doing',
  in_progress: 'doing',
  doing: 'doing',
  started: 'doing',
  review: 'review',
  'in-review': 'review',
  done: 'done',
  complete: 'done',
  completed: 'done',
  blocked: 'blocked',
  cancelled: 'cancelled',
  canceled: 'cancelled',
}

export function importBmad(source: BmadSource, now: string): BmadImport {
  const findings: BmadFinding[] = []
  const unrecognised: string[] = []
  const notes: string[] = []
  // Keyed by id, because the same story can appear in both a document and the sprint
  // status, and two rows for one task is a board that lies about how much work there is.
  const tasks = new Map<string, BoardEntry>()
  const fromSprintStatus = new Set<string>()
  let brief: string | null = null

  for (const [path, content] of Object.entries(source.files)) {
    const match = PATTERNS.find((pattern) => pattern.test.test(path))
    if (!match) {
      unrecognised.push(path)
      continue
    }
    findings.push({ path, kind: match.kind, title: titleOf(content, path) })

    if (match.kind === 'prd' && brief === null) brief = briefFromPrd(content)
    if (match.kind === 'epic' || match.kind === 'story') {
      const task = taskFromDocument(content, path, now)
      if (task) {
        const existing = tasks.get(task.id)
        // The document has the better title and owner; the sprint status has the better
        // status, and it wins on that one field wherever it has already spoken.
        tasks.set(task.id, {
          ...task,
          ...(fromSprintStatus.has(task.id) && existing ? { status: existing.status } : {}),
        })
      }
    }
    if (match.kind === 'sprint-status') {
      for (const task of tasksFromSprintStatus(content, now)) {
        const existing = tasks.get(task.id)
        fromSprintStatus.add(task.id)
        tasks.set(task.id, existing ? { ...existing, status: task.status } : task)
      }
    }
  }

  if (findings.length === 0) {
    notes.push('nothing recognisable was found; this may not be a BMAD project, or it may use other paths')
  }
  if (brief === null && findings.some((f) => f.kind !== 'prd')) {
    notes.push('no PRD was found, so BRIEF.md is yours to write')
  }
  const derived = [...tasks.values()]
  if (derived.length > 0) {
    notes.push(
      `${count(derived.length, 'task')} derived, but none of them carry acceptance criteria, owned files ` +
        'or a verify command, so none can be dispatched until a tech lead writes those',
    )
  }
  if (unrecognised.length > 0) {
    notes.push(`${count(unrecognised.length, 'file')} left alone because the shape was not recognised`)
  }

  return { findings, brief, tasks: derived, unrecognised, notes }
}

function count(n: number, one: string): string {
  return `${n} ${n === 1 ? one : `${one}s`}`
}

function titleOf(content: string, path: string): string {
  const heading = /^#\s+(.+)$/m.exec(content)?.[1]?.trim()
  if (heading) return heading
  const front = matter(content).data as { title?: unknown }
  if (typeof front.title === 'string') return front.title
  return path.split('/').pop() ?? path
}

function briefFromPrd(content: string): string {
  const title = titleOf(content, 'prd.md')
  const section = (name: string) =>
    // `m` matters: without it `^` only matches the start of the whole document, so no
    // heading after the first line is ever found and the brief comes out empty.
    new RegExp(`^#{1,3}\\s*${name}[^\\n]*\\n+([\\s\\S]*?)(?=\\n#{1,3}\\s|$)`, 'im').exec(content)?.[1]?.trim()

  return [
    `# BRIEF — ${title}`,
    '',
    'Imported from an existing PRD. Read it, then rewrite it in your own terms: an imported brief',
    'carries the previous project assumptions, and those are exactly what a new department should question.',
    '',
    '## Goal',
    section('goal') ?? section('problem') ?? section('overview') ?? '<not found in the PRD>',
    '',
    '## In scope',
    section('scope') ?? section('requirements') ?? '<not found in the PRD>',
    '',
    '## Not in scope',
    section('non-goals') ?? section('out of scope') ?? '<not found in the PRD — worth writing>',
    '',
    '## Success criteria',
    section('success') ?? section('metrics') ?? '<not found in the PRD — worth writing>',
    '',
  ].join('\n')
}

function taskFromDocument(content: string, path: string, now: string): BoardEntry | null {
  const front = matter(content).data as Record<string, unknown>
  const id = normaliseId(front.id ?? front.story_id ?? front.epic_id ?? path)
  if (!id) return null

  return {
    id,
    title: titleOf(content, path),
    status: mapStatus(front.status),
    owner: typeof front.owner === 'string' ? front.owner : 'techlead',
    type: path.includes('/epics') ? 'chore' : 'feature',
    priority: 'normal',
    depends_on: Array.isArray(front.depends_on) ? front.depends_on.map(String) : [],
    updated: now,
  }
}

function tasksFromSprintStatus(content: string, now: string): BoardEntry[] {
  let parsed: unknown
  try {
    parsed = content.trimStart().startsWith('{') ? JSON.parse(content) : parse(content)
  } catch {
    return []
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null
      ? Object.entries(parsed as Record<string, unknown>).map(([id, value]) =>
          typeof value === 'object' && value !== null ? { id, ...(value as object) } : { id, status: value },
        )
      : []

  const tasks: BoardEntry[] = []
  for (const row of rows as Array<Record<string, unknown>>) {
    const id = normaliseId(row.id ?? row.story ?? row.key)
    if (!id) continue
    tasks.push({
      id,
      title: typeof row.title === 'string' ? row.title : id,
      status: mapStatus(row.status),
      owner: typeof row.owner === 'string' ? row.owner : 'techlead',
      type: 'feature',
      priority: 'normal',
      depends_on: [],
      updated: now,
    })
  }
  return tasks
}

/** delphi task ids look like `T-012`. Anything else is reshaped, or refused. */
function normaliseId(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (raw === '') return null
  const match = /([A-Za-z]+)[-_ ]?(\d+)/.exec(raw.split('/').pop() ?? raw)
  if (!match) return null
  return `${(match[1] as string).toUpperCase()}-${match[2]}`
}

function mapStatus(value: unknown): TaskStatus {
  const key = String(value ?? '')
    .trim()
    .toLowerCase()
  return STATUS_MAP[key] ?? 'backlog'
}
