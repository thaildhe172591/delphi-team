import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  appendJournal,
  appendLine,
  BoardSchema,
  ClaudeAdapter,
  type ClaudeAgentEntry,
  chooseDispatchMode,
  type DepartmentPlan,
  type DispatchMode,
  isoNow,
  openTasks,
  planDepartment,
  planSurface,
  readOr,
  readTeam,
  readYaml,
  renderCommand,
  StorySchema,
  type Surface,
  spawnPrompt,
} from '@delphi-team/core'
import { Command } from 'commander'
import matter from 'gray-matter'
import { type Context, requireInitialised, resolveProject, UserError } from '../context.js'
import { columns, createReporter, plural } from '../output.js'

/**
 * Starting, watching and stopping a department.
 *
 * The decisions — which mode, which seats, what would collide — are pure functions in
 * core. This gathers the facts, carries out what was decided, and prints it.
 */

function sessionName(slug: string, seat: string, prefixLength: number): string {
  return `${slug.slice(0, prefixLength)}-${seat}`
}

/** Read the story fields the pre-spawn checks need. */
async function readStories(context: Context, slug: string, ids: string[]) {
  const paths = context.paths.project(slug)
  const stories: Record<string, ReturnType<typeof storyFields>> = {}
  for (const id of ids) {
    const text = await readOr(paths.story(id), '')
    if (text) stories[id] = storyFields(matter(text).data)
  }
  return stories
}

function storyFields(data: Record<string, unknown>) {
  // A bare `key:` in YAML is null, and an optional field rejects null rather than
  // treating it as absent. Dropping them first is the difference between reading a story
  // and silently discarding all of it because one line was left blank.
  const cleaned = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null))
  const parsed = StorySchema.partial().safeParse(cleaned)
  const story = parsed.success ? parsed.data : {}
  const invalid = parsed.success
    ? undefined
    : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
  return {
    ...(invalid ? { invalid } : {}),
    files: story.files ?? [],
    acceptance: story.acceptance ?? [],
    deliverables: story.deliverables ?? [],
    verify: story.verify,
    owner: story.owner ?? 'unknown',
    ...(story.handoff_to ? { handoff_to: story.handoff_to } : {}),
    attachments: story.attachments ?? [],
    title: story.title ?? '',
  }
}

/** Sessions delphi started, joined to what `claude agents --json` can see. */
async function liveSeats(context: Context, slug: string) {
  const dispatched = new Map<
    string,
    { seat: string; mode: string; name: string; model: string; task: string }
  >()
  const log = await readOr(context.paths.project(slug).sessions, '')

  for (const line of log.split('\n').filter(Boolean)) {
    const [, seat, mode, id, name, model, , task] = line.split(' | ').map((p) => p.trim())
    if (!seat) continue
    dispatched.set(name ?? seat, {
      seat,
      mode: mode ?? '',
      name: name ?? seat,
      model: model ?? '-',
      task: task ?? '-',
      ...(id ? {} : {}),
    })
  }

  let agents: ClaudeAgentEntry[] = []
  try {
    agents = await new ClaudeAdapter({ cwd: context.root }).agents({ all: false })
  } catch {
    // Not being able to ask is not the same as nothing running; say so rather than lying.
    return { dispatched, agents: null as ClaudeAgentEntry[] | null }
  }
  return { dispatched, agents }
}

export function deptCommand(): Command {
  const dept = new Command('dept').description('the department working on a project')

  dept
    .command('up')
    .description('work out who should start, and start them')
    .option('--team <name>', 'team template to use')
    .option('--mode <mode>', 'auto | teams | sessions | manual')
    .option('--phase <phase>', 'which phase the project is in, for seat guards')
    .option('--surface <surface>', 'wt | tmux | desktop | none — split a terminal to watch the seats')
    .option('--project <slug>')
    .option('--dry-run', 'show the plan and start nothing')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const paths = context.paths.project(slug)

      const teamName = (options.team as string) ?? context.config.defaults.team
      const team = readTeam(teamName)
      const board = await readYaml(paths.board, BoardSchema, { version: 1, tasks: [] })
      const assigned = board.tasks.filter((t) => t.status === 'ready' || t.status === 'doing')
      const stories = await readStories(
        context,
        slug,
        assigned.map((t) => t.id),
      )

      const { agents } = await liveSeats(context, slug)
      const running = (agents ?? [])
        .filter((a) => a.kind === 'background' && a.state !== 'done' && a.name)
        .map((a) => a.name as string)

      const plan = planDepartment({
        team,
        config: context.config,
        board,
        stories,
        ...(options.phase ? { phase: options.phase as string } : {}),
        running,
      })

      // A story whose frontmatter does not parse looks exactly like a story with no
      // acceptance criteria, and reporting the symptom sends the user to fix the wrong
      // thing. Say what is actually broken, first.
      for (const [id, story] of Object.entries(stories)) {
        if (!story.invalid) continue
        plan.problems.unshift({
          severity: 'block',
          message: `${id} frontmatter does not parse: ${story.invalid}`,
          fix: `fix .delphi/projects/${slug}/stories/${id}.md; nothing below is trustworthy until you do`,
        })
        plan.ok = false
      }

      const decision = chooseDispatchMode({
        ...(options.mode ? { requested: options.mode as DispatchMode } : {}),
        // A CLI running delphi is not the same as an interactive Claude Code session, and
        // only the latter can spawn teammates. Assume it is not, unless told otherwise.
        interactive: process.stdout.isTTY === true,
        surface: 'cli',
        teamsEnabled: process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === '1',
        canLaunchBackground: (await new ClaudeAdapter().version()) !== null,
        leadEffort: context.config.models.orchestrator?.effort,
        seatEfforts: Object.fromEntries(
          plan.active.map((s) => [s.seat, context.config.models[s.seat]?.effort]),
        ),
      })

      if (!plan.ok) {
        report.emit({ ok: false, mode: decision.mode, plan }, () => printPlan(report, plan, decision))
        throw new UserError(
          'this department cannot start yet',
          'fix the problems above; they are the ones that waste a whole shift',
        )
      }

      if (options.dryRun || decision.mode === 'manual') {
        const instructions = plan.active.map((seatPlan) => ({
          seat: seatPlan.seat,
          sessionName: sessionName(slug, seatPlan.seat, context.config.project_prefix_len),
          model: context.config.models[seatPlan.seat]?.model ?? null,
          effort: context.config.models[seatPlan.seat]?.effort ?? null,
          prompt: promptFor(slug, teamName, seatPlan.seat, seatPlan.tasks[0]?.id ?? '', stories),
        }))

        const manual = decision.mode === 'manual'

        // The session ids do not exist yet, so the surface command is shown with a
        // placeholder. Showing it is the point: this is the command that would open
        // windows on your screen, and you should be able to read it before it does.
        const requestedSurface = (options.surface as Surface | undefined) ?? context.config.dispatch.surface
        const surfacePlan =
          requestedSurface === 'none' || plan.active.length === 0
            ? null
            : planSurface(
                requestedSurface,
                plan.active.map((seatPlan) => ({
                  title: seatPlan.seat,
                  command: 'claude',
                  args: ['attach', '<session-id>'],
                  cwd: context.root,
                })),
                { session: slug },
              )

        report.emit(
          {
            ok: true,
            mode: decision.mode,
            dryRun: Boolean(options.dryRun),
            plan,
            instructions,
            surface: surfacePlan,
          },
          () => {
            printPlan(report, plan, decision)
            if (surfacePlan?.commands.length) {
              report.line('\nAfter the seats start, this would split the terminal:')
              for (const command of surfacePlan.commands) report.line(`  ${renderCommand(command)}`)
            }

            if (instructions.length === 0) {
              report.line('\nNothing to start.')
              return
            }
            // In manual mode these lines are the product: the user pastes them. In a dry
            // run of another mode they are a preview, and saying so avoids implying that
            // pasting them is what happens next.
            report.line(
              manual
                ? '\nOpen one session per seat and paste the block under it:\n'
                : '\nThe prompt each seat would receive:\n',
            )
            for (const one of instructions) {
              report.line(
                `─── ${one.seat} ── name it "${one.sessionName}"${one.model ? ` · ${one.model} · ${one.effort}` : ''}`,
              )
              report.line(one.prompt)
              report.line()
            }
            if (!manual && options.dryRun) report.line('Run without --dry-run to start them.')
          },
        )
        return
      }

      // sessions mode: start each seat as a background session.
      const adapter = new ClaudeAdapter({ cwd: context.root })
      const started: Array<{ seat: string; id: string; name: string; task: string }> = []

      for (const seatPlan of plan.active) {
        const task = seatPlan.tasks[0]
        if (!task) continue
        const name = sessionName(slug, seatPlan.seat, context.config.project_prefix_len)
        const models = context.config.models[seatPlan.seat]
        const { id } = await adapter.dispatch({
          prompt: promptFor(slug, teamName, seatPlan.seat, task.id, stories),
          agent: seatPlan.seat,
          name,
          ...(models?.model ? { model: models.model } : {}),
          ...(models?.effort ? { effort: models.effort } : {}),
        })
        await appendLine(
          paths.sessions,
          [
            isoNow(),
            seatPlan.seat,
            'background',
            id,
            name,
            models?.model ?? '-',
            models?.effort ?? '-',
            task.id,
          ].join(' | '),
        )
        started.push({ seat: seatPlan.seat, id, name, task: task.id })
      }

      await appendJournal(paths.journal, {
        id: '-',
        seat: 'orchestrator',
        event: `dept up (${decision.mode})`,
        detail: started.map((s) => `${s.seat}:${s.id}`).join(' '),
      })

      const surface = (options.surface as Surface | undefined) ?? context.config.dispatch.surface
      const surfacePlan =
        surface === 'none' || started.length === 0
          ? null
          : planSurface(
              surface,
              started.map((s) => ({
                title: s.seat,
                command: 'claude',
                args: ['attach', s.id],
                cwd: context.root,
              })),
              { session: slug },
            )

      report.emit({ ok: true, mode: decision.mode, started, plan, surface: surfacePlan }, () => {
        printPlan(report, plan, decision)
        report.line(`\nStarted ${plural(started.length, 'seat')}:`)
        for (const line of columns(
          started.map((s) => [`  ${s.seat}`, s.id, s.task, `claude attach ${s.id}`]),
        )) {
          report.line(line)
        }
        if (surfacePlan) {
          for (const note of surfacePlan.notes) report.line(`\n${note}`)
          if (surfacePlan.commands.length > 0) {
            // Printed rather than run: this opens windows on someone's screen, and the
            // Windows Terminal invocation has not been proven end to end here yet.
            report.line('\nTo split the terminal, run:')
            for (const command of surfacePlan.commands) report.line(`  ${renderCommand(command)}`)
          }
        }
      })
    })

  dept
    .command('status')
    .description('who is working, who is stuck, and what is waiting')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const paths = context.paths.project(slug)

      const board = await readYaml(paths.board, BoardSchema, { version: 1, tasks: [] })
      const { dispatched, agents } = await liveSeats(context, slug)

      // `claude agents --json` also lists interactive sessions with no id, and Remote
      // Control rows are not sessions on this machine at all. Only background rows are seats.
      const live = (agents ?? []).filter((a) => a.kind === 'background')
      const rows = live.map((entry) => {
        const record = entry.name ? dispatched.get(entry.name) : undefined
        return {
          seat: record?.seat ?? entry.name ?? '(unnamed)',
          name: entry.name ?? '-',
          id: entry.id ?? '-',
          state: entry.state ?? entry.status ?? '-',
          // This is how a seat stuck on a permission prompt announces itself.
          waitingFor: entry.waitingFor ?? null,
          model: record?.model ?? '-',
          task: record?.task ?? '-',
        }
      })

      const blocked = board.tasks.filter((t) => t.status === 'blocked')
      const waiting = rows.filter((r) => r.waitingFor)

      report.emit({ slug, seats: rows, blockedTasks: blocked, adapterReachable: agents !== null }, () => {
        if (agents === null) {
          report.line('Could not ask Claude Code what is running; showing the board only.')
        } else if (rows.length === 0) {
          report.line('No seats are running.')
        } else {
          for (const line of columns(
            rows.map((r) => [
              `  ${r.seat}`,
              r.state,
              r.model,
              r.task,
              r.waitingFor ? `waiting on ${r.waitingFor}` : '',
            ]),
          )) {
            report.line(line)
          }
        }

        if (waiting.length > 0) {
          report.line('\nWaiting for you:')
          for (const r of waiting) {
            report.line(`  ${r.seat} is stuck on a ${r.waitingFor}. Open it: claude attach ${r.id}`)
          }
        }

        if (blocked.length > 0) {
          report.line('\nBlocked tasks:')
          for (const t of blocked)
            report.line(`  ${t.id}  ${t.owner}  ${t.blocked_reason ?? '(no reason given)'}`)
        }

        const open = openTasks(board)
        report.line(`\n${plural(open.length, 'task')} open, ${plural(blocked.length, 'task')} blocked.`)
      })
    })

  dept
    .command('down')
    .description('stop the seats this project started')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)

      const { dispatched, agents } = await liveSeats(context, slug)
      if (agents === null) throw new UserError('could not ask Claude Code what is running')

      const adapter = new ClaudeAdapter({ cwd: context.root })
      const stopped: string[] = []
      for (const entry of agents) {
        if (entry.kind !== 'background' || !entry.id || !entry.name) continue
        if (!dispatched.has(entry.name)) continue
        await adapter.stop(entry.id)
        stopped.push(`${dispatched.get(entry.name)?.seat ?? entry.name} (${entry.id})`)
      }

      await appendJournal(context.paths.project(slug).journal, {
        id: '-',
        seat: 'orchestrator',
        event: 'dept down',
        detail: `${stopped.length} stopped`,
      })

      report.emit({ stopped }, () => {
        if (stopped.length === 0) {
          report.line('Nothing this project started is still running.')
          return
        }
        report.line(`Stopped ${plural(stopped.length, 'seat')}:`)
        for (const s of stopped) report.line(`  ${s}`)
        report.line('\nTheir conversations are kept. Write a checkpoint before you close the shift.')
      })
    })

  return dept
}

function promptFor(
  slug: string,
  team: string,
  seat: string,
  taskId: string,
  stories: Record<string, ReturnType<typeof storyFields>>,
): string {
  const story = stories[taskId]
  return spawnPrompt({
    seat,
    team,
    slug,
    taskId,
    title: story?.title ?? '',
    files: story?.files ?? [],
    deliverables: story?.deliverables ?? [],
    acceptance: story?.acceptance ?? [],
    verify: story?.verify,
    attachments: story?.attachments ?? [],
    handoffTo: story?.handoff_to,
  })
}

function printPlan(
  report: ReturnType<typeof createReporter>,
  plan: DepartmentPlan,
  decision: { mode: string; reason: string; notes: string[] },
): void {
  report.line(`Mode: ${decision.mode} — ${decision.reason}`)
  for (const note of decision.notes) report.line(`  · ${note}`)

  if (plan.problems.length > 0) {
    report.line()
    for (const problem of plan.problems) {
      report.line(`${problem.severity === 'block' ? ' blocks ' : ' warns  '} ${problem.message}`)
      if (problem.fix) report.line(`          -> ${problem.fix}`)
    }
  }

  if (plan.active.length > 0) {
    report.line('\nStarting:')
    for (const line of columns(
      plan.active.map((s) => [`  ${s.seat}`, s.tasks.map((t) => t.id).join(', ')]),
    )) {
      report.line(line)
    }
  }
  if (plan.held.length > 0) {
    report.line('\nHolding:')
    for (const line of columns(plan.held.map((s) => [`  ${s.seat}`, s.held ?? '']))) report.line(line)
  }
}

/** Write down what is not in the ledger, for whoever picks the work up. */
export function handoffCommand(): Command {
  const handoff = new Command('handoff').description('passing work between seats')

  handoff
    .command('new')
    .description('write a handover note')
    .requiredOption('--from <seat>')
    .requiredOption('--to <seat>')
    .option('--task <id>')
    .option('--note <text>', 'the part that is not in any file')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const paths = context.paths.project(slug)

      const now = isoNow()
      const stamp = now.replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
      const file = join(paths.handoffs, `${stamp}-${options.from}-${options.to}.md`)

      await mkdir(paths.handoffs, { recursive: true })
      await writeFile(
        file,
        [
          `# Handoff — ${options.from} to ${options.to}          ${now}`,
          '',
          `## Task`,
          options.task ?? '(none given)',
          '',
          '## What is not written down anywhere else',
          options.note ?? '(nothing added — the next seat gets only what is in the ledger)',
          '',
        ].join('\n'),
        'utf8',
      )

      // A handoff nobody is told about is a file nobody reads.
      const inbox = paths.inbox(options.to as string)
      await mkdir(inbox, { recursive: true })
      await writeFile(
        join(inbox, `${stamp}-handoff.md`),
        [
          '---',
          'status: unread',
          `from: ${options.from}`,
          `created: ${now}`,
          '---',
          '',
          `${options.from} handed you ${options.task ?? 'work'}.`,
          `Read: handoffs/${stamp}-${options.from}-${options.to}.md`,
          '',
        ].join('\n'),
        'utf8',
      )

      await appendJournal(paths.journal, {
        id: (options.task as string) ?? '-',
        seat: options.from as string,
        event: `handoff to ${options.to}`,
        detail: `handoffs/${stamp}-${options.from}-${options.to}.md`,
      })

      report.emit({ path: file, to: options.to }, () => {
        report.line(`Handed ${options.task ?? 'the work'} to ${options.to}.`)
        report.line(`  ${file}`)
        if (!options.note)
          report.line('\nNo note given. The next seat gets only what is already in the ledger.')
      })
    })

  handoff
    .command('list')
    .description('handovers on this project')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      let files: string[] = []
      try {
        files = (await readdir(context.paths.project(slug).handoffs)).sort()
      } catch {
        // No handoffs yet.
      }
      report.emit(files, () => {
        if (files.length === 0) report.line('No handovers yet.')
        for (const f of files) report.line(`  ${f}`)
      })
    })

  return handoff
}

export function inboxCommand(): Command {
  return new Command('inbox')
    .description('messages waiting for a seat')
    .argument('[seat]')
    .option('--all', 'including ones already read')
    .option('--read', 'mark them read after showing them')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (seat: string | undefined, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const who = seat ?? process.env.DELPHI_SEAT
      if (!who) throw new UserError('which seat?', 'pass a seat name, or set DELPHI_SEAT')

      const dir = context.paths.project(slug).inbox(who)
      let files: string[] = []
      try {
        files = (await readdir(dir)).sort()
      } catch {
        // No inbox yet is the same as an empty one.
      }

      const messages: Array<{ file: string; unread: boolean; body: string }> = []
      for (const file of files) {
        const body = await readFile(join(dir, file), 'utf8')
        const unread = body.includes('status: unread')
        if (!unread && !options.all) continue
        messages.push({ file, unread, body })
        if (options.read && unread) {
          await writeFile(join(dir, file), body.replace('status: unread', 'status: read'), 'utf8')
        }
      }

      report.emit({ seat: who, messages }, () => {
        if (messages.length === 0) {
          report.line(options.all ? 'Nothing in the inbox.' : 'Nothing unread.')
          return
        }
        for (const m of messages) {
          report.line(`─── ${m.file}${m.unread ? '  (unread)' : ''}`)
          report.line(matter(m.body).content.trim())
          report.line()
        }
      })
    })
}

export function nextCommand(): Command {
  return new Command('next')
    .description('what to pick up now')
    .option('--seat <seat>')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const board = await readYaml(context.paths.project(slug).board, BoardSchema, { version: 1, tasks: [] })

      const seat = (options.seat as string) ?? process.env.DELPHI_SEAT
      const done = new Set(board.tasks.filter((t) => t.status === 'done').map((t) => t.id))

      const mine = board.tasks.filter((t) => !seat || t.owner === seat)
      const doing = mine.filter((t) => t.status === 'doing')
      const startable = mine.filter((t) => t.status === 'ready' && t.depends_on.every((d) => done.has(d)))
      const waiting = mine.filter((t) => t.status === 'ready' && !t.depends_on.every((d) => done.has(d)))
      const blocked = mine.filter((t) => t.status === 'blocked')

      report.emit({ doing, startable, waiting, blocked }, () => {
        if (doing.length > 0) {
          report.line('Already in progress — finish this first:')
          for (const t of doing) report.line(`  ${t.id}  ${t.title}`)
          return
        }
        if (startable.length > 0) {
          report.line('Ready to start:')
          for (const t of startable) report.line(`  ${t.id}  ${t.owner}  ${t.title}`)
          return
        }
        if (blocked.length > 0) {
          report.line('Everything assigned is blocked:')
          for (const t of blocked) report.line(`  ${t.id}  ${t.blocked_reason ?? '(no reason given)'}`)
          return
        }
        if (waiting.length > 0) {
          report.line('Waiting on other work:')
          for (const t of waiting) report.line(`  ${t.id}  needs ${t.depends_on.join(', ')}`)
          return
        }
        report.line('Nothing to pick up.')
      })
    })
}

export function shiftCommand(): Command {
  const shift = new Command('shift').description('the working day')

  shift
    .command('end')
    .description('close the shift: checkpoint the project and stop the seats')
    .option('--note <text>', 'the resume note')
    .option('--keep-running', 'write the checkpoint but leave the seats up')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const paths = context.paths.project(slug)
      const board = await readYaml(paths.board, BoardSchema, { version: 1, tasks: [] })

      const unfinished = board.tasks.filter((t) => t.status === 'doing' || t.status === 'review')
      const noReason = board.tasks.filter((t) => t.status === 'blocked' && !t.blocked_reason)

      await appendJournal(paths.journal, { id: '-', seat: 'orchestrator', event: 'shift end' })

      report.emit({ slug, unfinished, blockedWithoutReason: noReason }, () => {
        report.line(`Closing the shift on ${slug}.`)
        if (unfinished.length > 0) {
          report.line(`\n${plural(unfinished.length, 'task')} still in flight:`)
          for (const t of unfinished) report.line(`  ${t.id}  ${t.status}  ${t.owner}  ${t.title}`)
          report.line('Each of those seats should run /shift-end before it stops.')
        }
        if (noReason.length > 0) {
          report.line('\nBlocked with no reason recorded — nobody can act on these tomorrow:')
          for (const t of noReason) report.line(`  ${t.id}  ${t.owner}`)
        }
        report.line('\nNext: `delphi checkpoint --note "..."`, then `delphi dept down`.')
        if (!options.note) {
          report.line(
            'A checkpoint without a resume note leaves tomorrow only what is already in the ledger.',
          )
        }
      })
    })

  return shift
}
