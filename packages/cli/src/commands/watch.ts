import {
  BoardSchema,
  ClaudeAdapter,
  type ClaudeAgentEntry,
  readJournalTail,
  readOr,
  readYaml,
  readyToStart,
} from '@delphi-team/core'
import { Command } from 'commander'
import { type Context, requireInitialised, resolveProject } from '../context.js'
import { columns, createReporter, plural } from '../output.js'

/**
 * A read-only view of the department.
 *
 * Read-only on purpose: a dashboard that can change things is a second way to change
 * them, and the ledger already has one. This shows what the board says and what Claude
 * Code says, side by side, so a disagreement between them is visible rather than hidden.
 */

interface Snapshot {
  project: string
  phase: string
  seats: Array<{ seat: string; state: string; waitingFor: string | null; task: string }>
  adapterReachable: boolean
  counts: Record<string, number>
  ready: string[]
  blocked: Array<{ id: string; owner: string; reason: string }>
  recent: Array<{ timestamp: string; seat: string; event: string }>
}

async function snapshot(context: Context, slug: string): Promise<Snapshot> {
  const paths = context.paths.project(slug)
  const board = await readYaml(paths.board, BoardSchema, { version: 1, tasks: [] })

  const counts: Record<string, number> = {}
  for (const task of board.tasks) counts[task.status] = (counts[task.status] ?? 0) + 1

  // What delphi started, so a running session can be named by its seat rather than its id.
  const dispatched = new Map<string, { seat: string; task: string }>()
  for (const line of (await readOr(paths.sessions, '')).split('\n').filter(Boolean)) {
    const [, seat, , , name, , , task] = line.split(' | ').map((p) => p.trim())
    if (name && seat) dispatched.set(name, { seat, task: task ?? '-' })
  }

  let agents: ClaudeAgentEntry[] | null = null
  try {
    agents = await new ClaudeAdapter({ cwd: context.root }).agents({ all: false })
  } catch {
    // Being unable to ask is different from nothing running, and the view says which.
  }

  const seats = (agents ?? [])
    .filter((entry) => entry.kind === 'background')
    .map((entry) => {
      const record = entry.name ? dispatched.get(entry.name) : undefined
      return {
        seat: record?.seat ?? entry.name ?? '(unnamed)',
        state: entry.state ?? entry.status ?? '-',
        waitingFor: entry.waitingFor ?? null,
        task: record?.task ?? '-',
      }
    })

  const state = await readOr(paths.state, '')
  const phase = /^##\s*Phase\s*\n+(.+)$/m.exec(state)?.[1]?.trim() ?? '—'

  return {
    project: slug,
    phase,
    seats,
    adapterReachable: agents !== null,
    counts,
    ready: readyToStart(board).map((t) => t.id),
    blocked: board.tasks
      .filter((t) => t.status === 'blocked')
      .map((t) => ({ id: t.id, owner: t.owner, reason: t.blocked_reason ?? '(no reason given)' })),
    recent: (await readJournalTail(paths.journal, 8)).map((e) => ({
      timestamp: e.timestamp.slice(11, 16),
      seat: e.seat,
      event: e.event,
    })),
  }
}

export function watchCommand(): Command {
  return new Command('watch')
    .description('a read-only view of the department')
    .option('--follow', 'keep refreshing until you stop it')
    .option('--interval <seconds>', 'how often to refresh with --follow', '5')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)

      if (!options.follow) {
        const view = await snapshot(context, slug)
        report.emit(view, () => render(report, view))
        return
      }

      const interval = Math.max(1, Number(options.interval)) * 1000
      let stop = false
      process.on('SIGINT', () => {
        stop = true
      })

      while (!stop) {
        const view = await snapshot(context, slug)
        // Clear and redraw. Nothing fancier: a dashboard is not worth a dependency.
        process.stdout.write('\u001B[2J\u001B[H')
        render(report, view)
        report.line(`\nrefreshing every ${options.interval}s · Ctrl+C to stop`)
        await new Promise((resolve) => setTimeout(resolve, interval))
      }
    })
}

function render(report: ReturnType<typeof createReporter>, view: Snapshot): void {
  report.line(`${view.project}   phase: ${view.phase}`)
  report.line('─'.repeat(70))

  const order = ['doing', 'review', 'ready', 'blocked', 'backlog', 'done']
  const summary = order
    .filter((status) => view.counts[status])
    .map((status) => `${view.counts[status]} ${status}`)
    .join(' · ')
  report.line(summary || 'nothing on the board')

  report.line('\nSeats')
  if (!view.adapterReachable) {
    report.line('  could not ask Claude Code what is running')
  } else if (view.seats.length === 0) {
    report.line('  none running')
  } else {
    for (const line of columns(
      view.seats.map((s) => [
        `  ${s.seat}`,
        s.state,
        s.task,
        s.waitingFor ? `waiting on ${s.waitingFor}` : '',
      ]),
    )) {
      report.line(line)
    }
  }

  if (view.blocked.length > 0) {
    report.line('\nBlocked')
    for (const line of columns(view.blocked.map((b) => [`  ${b.id}`, b.owner, b.reason]))) {
      report.line(line)
    }
  }

  if (view.ready.length > 0) {
    report.line(`\nReady to start: ${view.ready.join(', ')}`)
  }

  if (view.recent.length > 0) {
    report.line('\nRecent')
    for (const e of view.recent) report.line(`  ${e.timestamp}  ${e.seat.padEnd(14)} ${e.event}`)
  }

  const waiting = view.seats.filter((s) => s.waitingFor)
  if (waiting.length > 0) {
    report.line(`\n${plural(waiting.length, 'seat')} waiting for you to approve something.`)
  }
}
