import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  BoardSchema,
  isoNow,
  openTasks,
  ProjectIndexSchema,
  readOr,
  readYaml,
  writeAtomic,
} from '@delphi-team/core'
import { Command } from 'commander'
import { loadContext } from '../context.js'

/**
 * The entry point every delphi hook calls.
 *
 * **This command fails open, always.** Claude Code treats a non-zero exit from most hooks
 * as a non-blocking error, and only exit 2 blocks — but a hook that throws a stack trace
 * into a user session is its own kind of damage. So everything here is wrapped, every
 * problem is logged to a file, and the exit code is 0 unless a gate deliberately blocks.
 *
 * The one exception is `PreToolUse`, which uses the documented deny shape to keep the
 * orchestrator out of source code. Even that is a quality gate, not a security boundary:
 * a hook that times out does not gate at all, so the permission system is what protects
 * the user, and this only protects the shape of the work.
 */

/** Claude Code sends five sources, not four: `fork` was added in 2.1.214. */
type SessionSource = 'startup' | 'resume' | 'clear' | 'compact' | 'fork'

interface HookPayload {
  session_id?: string
  transcript_path?: string
  cwd?: string
  agent_type?: string
  hook_event_name?: string
  source?: SessionSource
  tool_name?: string
  tool_input?: { file_path?: string; [key: string]: unknown }
  trigger?: string
  [key: string]: unknown
}

export function hookCommand(): Command {
  return new Command('hook')
    .description('internal: the entry point for Claude Code hooks')
    .argument('<event>')
    .action(async (event: string) => {
      try {
        const payload = await readPayload()
        switch (event) {
          case 'SessionStart':
            await sessionStart(payload)
            break
          case 'PreCompact':
            await preCompact(payload)
            break
          case 'PreToolUse':
            await preToolUse(payload)
            break
          default:
            // An event we do not handle is not an error; the settings file may be ahead.
            break
        }
      } catch (error) {
        await logQuietly(event, error)
      }
      // Whatever happened above, do not interfere with the user session.
      process.exitCode = 0
    })
}

/**
 * Where the hook should look for the project.
 *
 * The payload carries a `cwd`, but a path we cannot resolve is worse than no path: the
 * hook would find no project and silently inject nothing. Falling back to the working
 * directory keeps it useful when the payload is odd, which is how this was noticed.
 */
async function projectContext(payload: HookPayload) {
  if (payload.cwd) {
    try {
      return await loadContext(payload.cwd)
    } catch {
      // Fall through to the working directory.
    }
  }
  return loadContext()
}

async function readPayload(): Promise<HookPayload> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (raw === '') return {}
  try {
    return JSON.parse(raw) as HookPayload
  } catch {
    // Malformed stdin is survivable: carry on with nothing rather than failing the session.
    return {}
  }
}

/**
 * Give a new session its bearings: which seat it is, where the project stands, what is
 * assigned to it, and what is waiting in its inbox.
 */
async function sessionStart(payload: HookPayload): Promise<void> {
  const context = await projectContext(payload)
  if (!context.initialised) return

  const seat = payload.agent_type ?? process.env.DELPHI_SEAT ?? null
  const index = await readYaml(context.paths.index, ProjectIndexSchema, { version: 1, projects: [] })
  const open = index.projects.filter((p) => p.status === 'open')
  if (open.length === 0) return

  const slug = open[0]?.slug as string
  const paths = context.paths.project(slug)
  const board = await readYaml(paths.board, BoardSchema, { version: 1, tasks: [] })
  const tasks = openTasks(board).filter((t) => seat === null || t.owner === seat)
  const unread = await countUnread(seat ? paths.inbox(seat) : null)

  const lines = [
    `You are working in the delphi-team department on project "${slug}".`,
    seat
      ? `Your seat is ${seat}.`
      : 'Your seat is not set. Ask the orchestrator which seat you are before doing anything; do not guess.',
    '',
    trimTo(await readOr(paths.state, ''), 1800),
  ]

  if (tasks.length > 0) {
    lines.push('', seat ? `Your open tasks:` : 'Open tasks:')
    for (const task of tasks.slice(0, 10)) {
      lines.push(`  ${task.id}  ${task.status}  ${task.owner}  ${task.title}`)
    }
  }
  if (unread > 0) lines.push('', `${unread} unread message(s) in your inbox — run \`delphi inbox\`.`)

  if (payload.source === 'compact' || payload.source === 'clear') {
    lines.push('', 'Context was just cleared or compacted. Re-read the files you were working on.')
  }
  if (payload.source === 'fork') {
    lines.push('', 'This session is a fork. Another session may hold the same tasks; check before writing.')
  }

  // The budget keeps this well under the 10,000 characters Claude Code will inline before
  // spilling it to a file and passing a path instead.
  const context_ = trimTo(lines.join('\n'), context.config.context.session_start_budget_kb * 1024)

  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context_ },
    })}\n`,
  )
}

/**
 * Write a checkpoint before context is compacted away.
 *
 * PreCompact can block but cannot inject, so there is no point trying to tell anyone
 * anything here. Saving the state is the useful half, and it happens silently.
 */
async function preCompact(payload: HookPayload): Promise<void> {
  const context = await projectContext(payload)
  if (!context.initialised) return

  const index = await readYaml(context.paths.index, ProjectIndexSchema, { version: 1, projects: [] })
  const slug = index.projects.find((p) => p.status === 'open')?.slug
  if (!slug) return

  const paths = context.paths.project(slug)
  const now = isoNow()
  const name = `${now.slice(0, 10).replaceAll('-', '')}-${now.slice(11, 16).replace(':', '')}-precompact.md`

  await mkdir(paths.checkpoints, { recursive: true })
  await writeAtomic(
    join(paths.checkpoints, name),
    [
      `# Checkpoint — ${now} (before ${payload.trigger ?? 'a'} compaction)`,
      '',
      '## STATE at this moment',
      '',
      (await readOr(paths.state, '(no STATE.md)')).trimEnd(),
      '',
      '## Resume note',
      '',
      'Written automatically before compaction. Nothing was added by hand.',
      '',
    ].join('\n'),
  )
}

/**
 * Keep the orchestrator out of source code.
 *
 * The orchestrator owns the ledger and the docs. When it starts editing code it stops
 * coordinating, fills its context with detail, and leaves no report behind.
 */
async function preToolUse(payload: HookPayload): Promise<void> {
  const seat = payload.agent_type ?? process.env.DELPHI_SEAT
  if (seat !== 'orchestrator') return

  const path = payload.tool_input?.file_path
  if (typeof path !== 'string') return

  const normalised = path.replaceAll('\\', '/')
  const allowed = ['/.delphi/', '/docs/', '/.claude/']
  if (allowed.some((prefix) => normalised.includes(prefix))) return

  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'The orchestrator does not edit source code. Write a story and dispatch the seat that owns this file. ' +
          'If you need to see what is in it, send a subagent to summarise it.',
      },
    })}\n`,
  )
}

async function countUnread(dir: string | null): Promise<number> {
  if (!dir) return 0
  try {
    const files = await readdir(dir)
    let unread = 0
    for (const file of files) {
      const content = await readFile(join(dir, file), 'utf8')
      if (content.includes('status: unread')) unread++
    }
    return unread
  } catch {
    return 0
  }
}

function trimTo(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}\n… trimmed; read the file for the rest.`
}

/** Never throw out of a hook. Leave a trail on disk instead. */
async function logQuietly(event: string, error: unknown): Promise<void> {
  try {
    const context = await loadContext()
    await mkdir(context.paths.logs, { recursive: true })
    await appendFile(
      join(context.paths.logs, 'hooks.jsonl'),
      `${JSON.stringify({ at: isoNow(), event, error: String(error) })}\n`,
      'utf8',
    )
  } catch {
    // If even the log cannot be written, there is nothing useful left to do here.
  }
}
