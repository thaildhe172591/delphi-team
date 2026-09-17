import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import {
  archiveHeader,
  buildPlugin,
  compactMemory,
  fitsInPreload,
  importBmad,
  isoNow,
  pendingWrites,
  planInit,
  readOr,
  writeAtomic,
} from '@delphi-team/core'
import { Command } from 'commander'
import { execa } from 'execa'
import { type Context, requireInitialised, resolveProject, UserError } from '../context.js'
import { columns, createReporter, plural } from '../output.js'

/** Where a seat's persistent memory lives (`memory: project` in its definition). */
function memoryDir(context: Context, seat: string): string {
  return join(context.root, '.claude', 'agent-memory', seat)
}

/**
 * Regenerate what the package owns after an upgrade, and leave what the user owns.
 *
 * The same planning code `init` uses, so there is one definition of who owns which file
 * rather than two that can drift.
 */
export function upgradeCommand(): Command {
  return new Command('upgrade')
    .description('bring the generated files up to date with this version of delphi')
    .option('--dry-run', 'show what would change and write nothing')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()

      const probe = planInit({ existing: {} })
      const existing: Record<string, string> = {}
      for (const write of probe.writes) {
        try {
          existing[write.path] = await readFile(join(context.root, write.path), 'utf8')
        } catch {
          // Missing is fine: an upgrade that adds a new file is still an upgrade.
        }
      }
      try {
        existing['.gitignore'] = await readFile(join(context.root, '.gitignore'), 'utf8')
      } catch {
        // ignore
      }

      const plan = planInit({ existing })
      const pending = pendingWrites(plan)

      if (!options.dryRun) {
        for (const write of pending) {
          const target = join(context.root, write.path)
          await mkdir(dirname(target), { recursive: true })
          await writeFile(target, write.content, 'utf8')
        }
      }

      report.emit(
        {
          dryRun: Boolean(options.dryRun),
          changes: pending.map(({ path, action, note }) => ({ path, action, ...(note ? { note } : {}) })),
        },
        () => {
          if (pending.length === 0) {
            report.line('Everything is already current.')
            return
          }
          report.line(options.dryRun ? 'Would update:' : 'Updated:')
          for (const line of columns(pending.map((w) => [`  ${w.action}`, w.path, w.note ?? '']))) {
            report.line(line)
          }
          report.line('\nYour config and the project block inside each seat were left alone.')
          report.line('Seats that are running will not pick this up. Restart them.')
        },
      )
    })
}

export function memoryCommand(): Command {
  const memory = new Command('memory').description('what a seat remembers between sessions')

  memory
    .command('show <seat>')
    .description('a seat memory, and whether Claude Code will actually read all of it')
    .option('--json', 'machine-readable output')
    .action(async (seat: string, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const file = join(memoryDir(context, seat), 'MEMORY.md')
      const content = await readOr(file, '')

      const lines = content === '' ? 0 : content.split('\n').length
      const fits = fitsInPreload(content)

      report.emit({ seat, path: file, lines, bytes: Buffer.byteLength(content), preloaded: fits }, () => {
        if (content === '') {
          report.line(`${seat} has no memory file yet.`)
          report.line(`  it would live at ${relative(context.root, file)}`)
          return
        }
        report.line(content.trimEnd())
        report.line(`\n─── ${plural(lines, 'line')}, ${Buffer.byteLength(content)} bytes`)
        report.line(
          fits
            ? 'All of it is preloaded at session start.'
            : 'Only the first 200 lines or 25 KB are preloaded — the rest is never read at startup. Run `delphi memory compact`.',
        )
      })
    })

  memory
    .command('compact <seat>')
    .description('move the overflow into an archive so the preloaded part is the part that fits')
    .option('--dry-run', 'show what would move and write nothing')
    .option('--json', 'machine-readable output')
    .action(async (seat: string, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const dir = memoryDir(context, seat)
      const file = join(dir, 'MEMORY.md')
      const content = await readOr(file, '')
      if (content === '') throw new UserError(`${seat} has no memory to compact`)

      const result = compactMemory(content, context.config.memory.compact_threshold_lines)

      if (result.unchanged) {
        report.emit({ seat, unchanged: true, lines: result.keptLines }, () =>
          report.line(`${seat} memory already fits: ${plural(result.keptLines, 'line')}, nothing moved.`),
        )
        return
      }

      const archive = join(dir, 'MEMORY-archive.md')
      if (!options.dryRun) {
        const existing = await readOr(archive, archiveHeader(seat, isoNow()))
        await writeAtomic(archive, `${existing.trimEnd()}\n\n${result.archived ?? ''}`)
        await writeAtomic(file, result.kept)
      }

      report.emit(
        {
          seat,
          dryRun: Boolean(options.dryRun),
          keptLines: result.keptLines,
          archivedLines: result.archivedLines,
          archive,
        },
        () => {
          report.line(
            `${options.dryRun ? 'Would keep' : 'Kept'} ${plural(result.keptLines, 'line')}, ` +
              `${options.dryRun ? 'moving' : 'moved'} ${plural(result.archivedLines, 'line')} to MEMORY-archive.md.`,
          )
          report.line('\nNothing was deleted. If something in the archive still matters, move it back to the')
          report.line('top of MEMORY.md — the top is the part that gets read.')
        },
      )
    })

  return memory
}

/**
 * A worktree per seat, so two seats editing the same repository do not fight over it.
 *
 * Untracked files a build needs — `.env` and friends — are copied in, because a worktree
 * starts with only what git tracks and a seat that cannot run the build is no use.
 */
export function worktreeCommand(): Command {
  const worktree = new Command('worktree').description('an isolated checkout per seat')

  worktree
    .command('create <seat>')
    .description('create a git worktree for a seat')
    .option('--branch <name>', 'branch to create; defaults to delphi/<seat>')
    .option('--path <path>', 'where to put it; defaults to ../<repo>-<seat>')
    .option('--json', 'machine-readable output')
    .action(async (seat: string, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()

      const branch = (options.branch as string) ?? `delphi/${seat}`
      const target =
        (options.path as string) ??
        join(dirname(context.root), `${context.root.split(/[\\/]/).pop()}-${seat}`)

      if (existsSync(target)) throw new UserError(`${target} already exists`)

      try {
        await execa('git', ['worktree', 'add', '-b', branch, target], { cwd: context.root, input: '' })
      } catch (error) {
        throw new UserError(
          `git could not create the worktree`,
          error instanceof Error ? error.message.split('\n')[0] : undefined,
        )
      }

      const copied: string[] = []
      for (const pattern of context.config.worktree.copy_untracked) {
        const source = join(context.root, pattern)
        if (!existsSync(source)) continue
        await writeFile(join(target, pattern), await readFile(source), { flag: 'wx' }).then(
          () => copied.push(pattern),
          () => {
            // Already there is not a failure.
          },
        )
      }

      report.emit({ seat, branch, path: target, copied }, () => {
        report.line(`Worktree for ${seat}:`)
        report.line(`  ${target}  on ${branch}`)
        if (copied.length > 0) report.line(`  copied: ${copied.join(', ')}`)
        report.line('\nStart the seat there, not here, or it will edit the wrong checkout.')
      })
    })

  worktree
    .command('remove <seat>')
    .description('remove a seat worktree')
    .option('--path <path>')
    .option('--json', 'machine-readable output')
    .action(async (seat: string, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const target =
        (options.path as string) ??
        join(dirname(context.root), `${context.root.split(/[\\/]/).pop()}-${seat}`)

      try {
        // Without --force, git refuses when there is uncommitted work. That refusal is the
        // feature: it is the only thing standing between a seat and a lost afternoon.
        await execa('git', ['worktree', 'remove', target], { cwd: context.root, input: '' })
      } catch (error) {
        throw new UserError(
          `git would not remove ${target}`,
          `${error instanceof Error ? error.message.split('\n')[0] : ''}\n` +
            'Usually this means there is uncommitted work there. Look before forcing it.',
        )
      }

      report.emit({ seat, path: target }, () => report.line(`Removed ${target}.`))
    })

  return worktree
}

export function exportCommand(): Command {
  const exportCmd = new Command('export').description('produce other distributions from the templates')

  exportCmd
    .command('plugin')
    .description('generate a Claude Code plugin')
    .option('--out <dir>', 'where to write it', 'plugin')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      // The plugin carries delphi's version, not the host project's: it is delphi's
      // templates that are being packaged.
      const plugin = buildPlugin({ version: __DELPHI_VERSION__ })

      // `resolve` rather than `join`: an absolute --out is a perfectly reasonable thing to
      // pass, and joining it onto the project root produces a nonsense path.
      const out = resolve(context.root, options.out as string)
      await rm(out, { recursive: true, force: true })
      for (const file of plugin.files) {
        const target = join(out, file.path)
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, file.content, 'utf8')
      }

      report.emit({ out, files: plugin.files.map((f) => f.path), limitations: plugin.limitations }, () => {
        report.line(`Wrote ${plural(plugin.files.length, 'file')} to ${options.out}.`)
        report.line('\nWhat a plugin cannot carry:')
        for (const limitation of plugin.limitations) report.line(`  · ${limitation}`)
      })
    })

  return exportCmd
}

/**
 * Put several seats on one question and record what was decided.
 *
 * This writes the prompts and the minutes; it does not run the discussion. A meeting is
 * the orchestrator talking to seats it already has, and inventing a second way to start
 * them would be a second thing to keep working.
 */
export function meetingCommand(): Command {
  return new Command('meeting')
    .description('put several seats on one question, and record the outcome')
    .argument('<seats...>')
    .requiredOption('--topic <topic>', 'the question being decided')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (seats: string[], options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)

      const missing = seats.filter((seat) => !existsSync(context.paths.agent(seat)))
      if (missing.length > 0) {
        throw new UserError(`no such seat: ${missing.join(', ')}`, 'run `delphi role list`')
      }

      const prompts = seats.map((seat) => ({
        seat,
        prompt: [
          `You are @${seat}. The department is deciding: ${options.topic}`,
          `Answer from your seat only. Say what you would do, what it costs, and what would change your mind.`,
          'At most ten lines. If this is outside your scope, say so and name the seat it belongs to.',
        ].join('\n'),
      }))

      const minutes = [
        `## D-DRAFT — ${options.topic}`,
        `**Status:** proposed · ${isoNow()} · meeting of ${seats.join(', ')}`,
        '**Context:** <why this needed deciding>',
        '',
        ...seats.map((seat) => `**${seat}:** <their position>`),
        '',
        '**Decision:** <what was chosen>',
        '**Alternatives:** <what was rejected, and why>',
        '**Consequences:** <what this makes easy, and what it makes hard>',
        '',
      ].join('\n')

      report.emit({ topic: options.topic, seats, prompts, minutes }, () => {
        report.line(`Meeting on: ${options.topic}\n`)
        for (const one of prompts) {
          report.line(`─── ask @${one.seat}`)
          report.line(one.prompt)
          report.line()
        }
        report.line('When they have answered, append the minutes to DECISIONS.md:\n')
        report.line(minutes)
        report.line(`  ${context.paths.project(slug).decisions}`)
      })
    })
}

/**
 * What delphi itself started. **Not** what your account was charged.
 *
 * Phase 0 established there is no documented, stable local source for historical spend,
 * so this counts sessions rather than money. Reporting a number that looks like cost and
 * is not would be worse than reporting nothing.
 */
export function costCommand(): Command {
  return new Command('cost')
    .description('sessions delphi has started — not your account spend')
    .option('--seat <seat>')
    .option('--since <date>', 'ISO date, e.g. 2026-09-01')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)

      const rows: Array<{
        at: string
        seat: string
        mode: string
        model: string
        effort: string
        task: string
      }> = []
      for (const line of (await readOr(context.paths.project(slug).sessions, ''))
        .split('\n')
        .filter(Boolean)) {
        const [at, seat, mode, , , model, effort, task] = line.split(' | ').map((p) => p.trim())
        if (!at || !seat) continue
        if (options.seat && seat !== options.seat) continue
        if (options.since && at < String(options.since)) continue
        rows.push({
          at,
          seat,
          mode: mode ?? '-',
          model: model ?? '-',
          effort: effort ?? '-',
          task: task ?? '-',
        })
      }

      const bySeat: Record<string, number> = {}
      for (const row of rows) bySeat[row.seat] = (bySeat[row.seat] ?? 0) + 1

      report.emit({ project: slug, sessions: rows, bySeat, isAccountSpend: false }, () => {
        if (rows.length === 0) {
          report.line('delphi has not started any sessions on this project yet.')
          return
        }
        for (const line of columns(
          Object.entries(bySeat).map(([seat, n]) => [`  ${seat}`, plural(n, 'session')]),
        )) {
          report.line(line)
        }
        report.line(`\n${plural(rows.length, 'session')} in total.`)
        report.line(
          '\nThis counts what delphi started. It is not your account spend: Claude Code exposes no stable\n' +
            'local source for that, so delphi does not pretend to know it. Use /usage for the real figure.',
        )
      })
    })
}

export function importCommand(): Command {
  const importCmd = new Command('import').description('bring an existing project into a delphi ledger')

  importCmd
    .command('bmad')
    .description('map BMAD-METHOD artifacts onto a delphi ledger')
    .option('--from <dir>', 'where to look', 'docs')
    .option('--project <slug>')
    .option('--dry-run', 'show what would be imported and write nothing')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)

      const root = join(context.root, options.from as string)
      const files: Record<string, string> = {}
      for (const path of await walk(root)) {
        if (!/\.(md|ya?ml|json)$/i.test(path)) continue
        files[relative(context.root, path).replaceAll('\\', '/')] = await readFile(path, 'utf8')
      }

      const result = importBmad({ files }, isoNow())

      if (!options.dryRun && result.tasks.length > 0) {
        const { addTask } = await import('@delphi-team/core')
        const board = context.paths.project(slug).board
        for (const task of result.tasks) {
          await addTask(board, task).catch(() => {
            // A task already on the board is not an error; the import is additive.
          })
        }
      }
      if (!options.dryRun && result.brief) {
        const brief = context.paths.project(slug).brief
        await writeAtomic(`${brief}.imported`, result.brief)
      }

      report.emit({ ...result, dryRun: Boolean(options.dryRun) }, () => {
        if (result.findings.length === 0) {
          report.line(`Nothing recognisable under ${options.from}.`)
          for (const note of result.notes) report.line(`  · ${note}`)
          return
        }
        report.line(`Found ${plural(result.findings.length, 'artifact')}:`)
        for (const line of columns(result.findings.map((f) => [`  ${f.kind}`, f.path, f.title]))) {
          report.line(line)
        }
        if (result.tasks.length > 0) {
          report.line(`\n${options.dryRun ? 'Would add' : 'Added'} ${plural(result.tasks.length, 'task')}:`)
          for (const line of columns(result.tasks.map((t) => [`  ${t.id}`, t.status, t.owner, t.title]))) {
            report.line(line)
          }
        }
        if (result.brief && !options.dryRun) {
          report.line(
            '\nA draft brief was written to BRIEF.md.imported — read it, then replace BRIEF.md yourself.',
          )
        }
        report.line('')
        for (const note of result.notes) report.line(`  · ${note}`)
      })
    })

  return importCmd
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  try {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) out.push(...(await walk(full)))
      else out.push(full)
    }
  } catch {
    // A directory that is not there simply contributes nothing.
  }
  return out
}
