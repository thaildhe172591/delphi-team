import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  addTask,
  appendJournal,
  type BoardEntry,
  BoardSchema,
  isoNow,
  moveTask,
  openTasks,
  ProjectIndexSchema,
  readBoard,
  readJournalTail,
  readOr,
  readTemplate,
  readYaml,
  readyToStart,
  type TaskStatus,
  TaskStatusSchema,
  updateYaml,
  writeAtomic,
} from '@delphi-team/core'
import { Command } from 'commander'
import { requireInitialised, resolveProject, UserError } from '../context.js'
import { columns, createReporter, plural } from '../output.js'

/** Fill `<placeholders>` in a ledger template. */
function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`<${key}>`, value), template)
}

export function projectCommand(): Command {
  const project = new Command('project').description('projects this department is working on')

  project
    .command('new <slug>')
    .description('start a project ledger')
    .requiredOption('--title <title>', 'what this project is')
    .option('--json', 'machine-readable output')
    .action(async (slug: string, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const paths = context.paths.project(slug)

      const index = await readYaml(context.paths.index, ProjectIndexSchema, { version: 1, projects: [] })
      if (index.projects.some((p) => p.slug === slug)) {
        throw new UserError(`project "${slug}" already exists`, 'run `delphi project list` to see them')
      }

      const now = isoNow()
      for (const dir of ['stories', 'reports', 'inbox', 'knowledge', 'checkpoints', 'handoffs']) {
        await mkdir(join(paths.root, dir), { recursive: true })
      }
      await writeAtomic(
        paths.brief,
        fill(readTemplate('ledger/BRIEF.md'), { 'project title': options.title }),
      )
      await writeAtomic(
        paths.state,
        fill(readTemplate('ledger/STATE.md'), {
          'project title': options.title,
          'ISO time': now,
          seat: 'orchestrator',
        }),
      )
      await writeAtomic(paths.journal, readTemplate('ledger/JOURNAL.md'))
      await writeAtomic(paths.decisions, readTemplate('ledger/DECISIONS.md'))
      await writeAtomic(paths.board, readTemplate('ledger/board.yaml'))

      await updateYaml(context.paths.index, ProjectIndexSchema, { version: 1, projects: [] }, (current) => ({
        ...current,
        projects: [
          ...current.projects,
          { slug, title: options.title, status: 'open' as const, updated: now },
        ],
      }))
      await appendJournal(paths.journal, { id: '-', seat: 'orchestrator', event: 'project created' })

      report.emit({ slug, title: options.title, root: paths.root }, () => {
        report.line(`Created ${slug}.`)
        report.line(`  ${paths.root}`)
        report.line('\nNext: write BRIEF.md, then plan the first stories.')
      })
    })

  project
    .command('list')
    .description('list projects')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const index = await readYaml(context.paths.index, ProjectIndexSchema, { version: 1, projects: [] })

      report.emit(index.projects, () => {
        if (index.projects.length === 0) {
          report.line('No projects yet. Start one with `delphi project new <slug> --title "..."`.')
          return
        }
        for (const line of columns(
          index.projects.map((p) => [`  ${p.slug}`, p.status, p.title, p.updated.slice(0, 10)]),
        )) {
          report.line(line)
        }
      })
    })

  for (const [name, status] of [
    ['open', 'open'],
    ['close', 'closed'],
  ] as const) {
    project
      .command(`${name} <slug>`)
      .description(`mark a project as ${status}`)
      .option('--json', 'machine-readable output')
      .action(async (slug: string, options) => {
        const report = createReporter(Boolean(options.json))
        const context = await requireInitialised()
        let found = false
        await updateYaml(
          context.paths.index,
          ProjectIndexSchema,
          { version: 1, projects: [] },
          (current) => ({
            ...current,
            projects: current.projects.map((p) => {
              if (p.slug !== slug) return p
              found = true
              return { ...p, status, updated: isoNow() }
            }),
          }),
        )
        if (!found) throw new UserError(`no project "${slug}"`)
        report.emit({ slug, status }, () => report.line(`${slug} is now ${status}.`))
      })
  }

  return project
}

export function stateCommand(): Command {
  return new Command('state')
    .description('the current snapshot of a project')
    .argument('[action]', 'show', 'show')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (_action: string, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const content = await readOr(context.paths.project(slug).state, '')
      report.emit({ slug, state: content }, () => report.line(content.trimEnd()))
    })
}

export function journalCommand(): Command {
  const journal = new Command('journal').description('the event log of a project')

  journal
    .command('add')
    .description('record an event')
    .requiredOption('--event <text>', 'what happened')
    .option('--id <id>', 'task or decision id', '-')
    .option('--seat <seat>', 'who did it', 'orchestrator')
    .option('--detail <text>', 'a path or a note')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const entry = {
        id: options.id as string,
        seat: options.seat as string,
        event: options.event as string,
        ...(options.detail ? { detail: options.detail as string } : {}),
      }
      await appendJournal(context.paths.project(slug).journal, entry)
      report.emit({ slug, ...entry }, () => report.line(`Recorded: ${entry.event}`))
    })

  journal
    .command('tail')
    .description('the most recent events')
    .option('-n, --lines <count>', 'how many', '20')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const entries = await readJournalTail(context.paths.project(slug).journal, Number(options.lines))
      report.emit(entries, () => {
        for (const e of entries) {
          report.line(`${e.timestamp}  ${e.id.padEnd(8)} ${e.seat.padEnd(14)} ${e.event}`)
        }
      })
    })

  return journal
}

export function checkpointCommand(): Command {
  return new Command('checkpoint')
    .description('save a restore point for the project')
    .option('--note <text>', 'what is not in the ledger yet')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const paths = context.paths.project(slug)

      const now = isoNow()
      const name = `${now.slice(0, 16).replace(/[-:T]/g, '').slice(0, 8)}-${now.slice(11, 16).replace(':', '')}.md`
      const target = join(paths.checkpoints, name)

      const state = await readOr(paths.state, '(no STATE.md yet)')
      const content = [
        `# Checkpoint — ${now}`,
        '',
        '## STATE at this moment',
        '',
        state.trimEnd(),
        '',
        '## Resume note',
        '',
        options.note ?? '(none given — the next session gets only what is in the ledger)',
        '',
      ].join('\n')

      await mkdir(paths.checkpoints, { recursive: true })
      await writeAtomic(target, content)
      await appendJournal(paths.journal, {
        id: '-',
        seat: 'orchestrator',
        event: 'checkpoint',
        detail: `checkpoints/${name}`,
      })

      report.emit({ slug, path: target }, () => {
        report.line(`Checkpoint saved: checkpoints/${name}`)
        if (!options.note) {
          report.line('No resume note given. The next session gets only what is already in the ledger.')
        }
      })
    })
}

export function storyCommand(): Command {
  // `.command()` returns the subcommand, not the parent. Chaining straight off it returns
  // the wrong object, and the subcommand ends up registered at the top level.
  const story = new Command('story').description('handover packages for individual pieces of work')

  story
    .command('new <id>')
    .description('write a story file and put it on the board')
    .requiredOption('--title <title>')
    .requiredOption('--owner <seat>')
    .option('--type <type>', 'feature | bug | spike | chore', 'feature')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (id: string, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const paths = context.paths.project(slug)
      const now = isoNow()

      const content = fill(readTemplate('ledger/story.md'), {
        'T-001': id,
        'what this delivers, in one line': options.title,
        seat: options.owner,
        'ISO time': now,
      }).replace(/^type: feature.*$/m, `type: ${options.type}`)

      await mkdir(join(paths.root, 'stories'), { recursive: true })
      await writeAtomic(paths.story(id), content)
      await addTask(paths.board, {
        id,
        title: options.title,
        status: 'backlog',
        owner: options.owner,
        type: options.type,
        priority: 'normal',
        depends_on: [],
        updated: now,
      })
      await appendJournal(paths.journal, {
        id,
        seat: options.owner,
        event: 'story created',
        detail: `stories/${id}.md`,
      })

      report.emit({ id, path: paths.story(id) }, () => {
        report.line(`Created ${id}.`)
        report.line(`  ${paths.story(id)}`)
        report.line('\nFill in files, acceptance and verify before moving it to ready.')
      })
    })

  return story
}

export function taskCommand(): Command {
  const task = new Command('task').description('the board')

  task
    .command('list')
    .description('what is on the board')
    .option('--open', 'only tasks that are not finished')
    .option('--ready', 'only tasks whose dependencies are met')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const board = await readBoard(context.paths.project(slug).board)

      const tasks = options.ready ? readyToStart(board) : options.open ? openTasks(board) : board.tasks
      report.emit(tasks, () => {
        if (tasks.length === 0) {
          report.line('Nothing on the board.')
          return
        }
        for (const line of columns(
          tasks.map((t: BoardEntry) => [
            `  ${t.id}`,
            t.status,
            t.owner,
            t.title,
            t.blocked_reason ? `— ${t.blocked_reason}` : '',
          ]),
        )) {
          report.line(line)
        }
      })
    })

  task
    .command('move <id> <status>')
    .description('move a task, if the move is legal')
    .option('--reason <text>', 'required when blocking')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (id: string, status: string, options) => {
      const report = createReporter(Boolean(options.json))
      const parsed = TaskStatusSchema.safeParse(status)
      if (!parsed.success) {
        throw new UserError(
          `"${status}" is not a task status`,
          `use one of: ${TaskStatusSchema.options.join(', ')}`,
        )
      }
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const paths = context.paths.project(slug)

      // The transition rules need to know what the story promises and whether a report
      // exists, so the evidence comes from the ledger rather than from the caller.
      const story = await readOr(paths.story(id), '')
      const evidence = {
        acceptance: matchList(story, 'acceptance'),
        files: matchList(story, 'files'),
        hasReport: await hasReport(paths.reportsFor(await ownerOf(paths.board, id)), id),
        ...(options.reason ? { reason: options.reason as string } : {}),
      }

      const moved = await moveTask(paths.board, id, parsed.data as TaskStatus, evidence)
      await appendJournal(paths.journal, {
        id,
        seat: moved.owner,
        event: `status -> ${moved.status}`,
        ...(options.reason ? { detail: options.reason as string } : {}),
      })

      report.emit(moved, () => report.line(`${id} is now ${moved.status}.`))
    })

  task
    .command('show <id>')
    .description('a task and its story')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (id: string, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const paths = context.paths.project(slug)
      const board = await readBoard(paths.board)
      const entry = board.tasks.find((t) => t.id === id)
      if (!entry) throw new UserError(`no task ${id} on the board`)
      const story = await readOr(paths.story(id), '')

      report.emit({ ...entry, story }, () => {
        report.line(`${entry.id}  ${entry.status}  ${entry.owner}`)
        report.line(entry.title)
        if (story) report.line(`\n${story.trimEnd()}`)
      })
    })

  return task
}

export function reportCommand(): Command {
  return new Command('report')
    .description('write a report and print the message to send the orchestrator')
    .argument('<seat>')
    .argument('<id>')
    .argument('<outcome>', 'DONE | BLOCKED | DECISION | RISK | PROGRESS')
    .option('--summary <text>', 'one line for the message')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (seat: string, id: string, outcome: string, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const paths = context.paths.project(slug)

      const dir = paths.reportsFor(seat)
      await mkdir(dir, { recursive: true })
      const n = (await countReports(dir, id)) + 1
      const target = paths.report(seat, id, n)

      const content = fill(readTemplate('ledger/report.md'), {
        seat,
        'task id': id,
        n: String(n),
        'ISO time': isoNow(),
        'DONE | BLOCKED | DECISION | RISK | PROGRESS': outcome.toUpperCase(),
      })
      await writeAtomic(target, content)
      await appendJournal(paths.journal, {
        id,
        seat,
        event: `report ${outcome.toUpperCase()}`,
        detail: `reports/${seat}/${id}-${n}.md`,
      })

      const message = [
        `[${seat}] ${id} ${outcome.toUpperCase()}`,
        `Summary: ${options.summary ?? '<fill this in>'}`,
        'Needs orchestrator: no',
        `Detail: reports/${seat}/${id}-${n}.md`,
      ].join('\n')

      report.emit({ path: target, message }, () => {
        report.line(`Report started: reports/${seat}/${id}-${n}.md`)
        report.line('\nFill it in, then send the orchestrator:\n')
        report.line(message)
      })
    })
}

export function resumeCommand(): Command {
  return new Command('resume')
    .description('the package a new orchestrator needs to pick up where the last one stopped')
    .argument('[slug]')
    .option('--json', 'machine-readable output')
    .action(async (slug: string | undefined, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const resolved = await resolveProject(context, slug)
      const paths = context.paths.project(resolved)
      const { resume } = context.config

      // Read in the documented order and stop at the budget. Code is deliberately absent:
      // a session that spends its context rebuilding has none left to work with.
      const board = await readBoard(paths.board)
      const open = openTasks(board)
      const pack = {
        project: resolved,
        brief: head(await readOr(paths.brief, ''), 40),
        state: await readOr(paths.state, ''),
        checkpoint: await newestCheckpoint(paths.checkpoints),
        decisions: tail(await readOr(paths.decisions, ''), resume.decisions_tail * 8),
        openTasks: open,
        readyToStart: readyToStart(board).map((t) => t.id),
        journal: await readJournalTail(paths.journal, resume.journal_tail),
      }

      report.emit(pack, () => {
        report.line(`# ${resolved}`)
        report.line(`\n${pack.state.trimEnd()}`)
        report.line(`\n## Open tasks (${open.length})`)
        for (const line of columns(open.map((t) => [`  ${t.id}`, t.status, t.owner, t.title]))) {
          report.line(line)
        }
        report.line(`\n## Recent events`)
        for (const e of pack.journal.slice(-10)) report.line(`  ${e.timestamp}  ${e.seat}  ${e.event}`)
        report.line('\nNow check this against the working tree before acting on it.')
      })
    })
}

// --- small helpers ------------------------------------------------------------------

function head(text: string, lines: number): string {
  return text.split('\n').slice(0, lines).join('\n')
}

function tail(text: string, lines: number): string {
  return text.split('\n').slice(-lines).join('\n')
}

/** Read a YAML list out of story frontmatter without parsing the whole document. */
function matchList(story: string, key: string): string[] {
  const inline = new RegExp(`^${key}:\\s*\\[(.*)\\]\\s*$`, 'm').exec(story)
  if (inline) {
    return (inline[1] ?? '')
      .split(',')
      .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  }
  const block = new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s.*\\n?)+)`, 'm').exec(story)
  if (!block) return []
  return (block[1] ?? '')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*-\s*/, '')
        .trim()
        .replace(/^['"]|['"]$/g, ''),
    )
    .filter(Boolean)
}

async function ownerOf(boardPath: string, id: string): Promise<string> {
  const board = await readYaml(boardPath, BoardSchema, { version: 1, tasks: [] })
  return board.tasks.find((t) => t.id === id)?.owner ?? 'unknown'
}

async function countReports(dir: string, id: string): Promise<number> {
  try {
    return (await readdir(dir)).filter((f) => f.startsWith(`${id}-`)).length
  } catch {
    return 0
  }
}

async function hasReport(dir: string, id: string): Promise<boolean> {
  return (await countReports(dir, id)) > 0
}

async function newestCheckpoint(dir: string): Promise<string | null> {
  try {
    const files = (await readdir(dir)).sort()
    const newest = files.at(-1)
    return newest ? await readFile(join(dir, newest), 'utf8') : null
  } catch {
    return null
  }
}

export { plural, writeFile }
