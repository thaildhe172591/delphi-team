import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { type InitPlan, type PlannedWrite, pendingWrites, planInit } from '@delphi-team/core'
import { Command } from 'commander'
import { findProjectRoot, UserError } from '../context.js'
import { columns, createReporter, EXIT, plural } from '../output.js'

/**
 * Scaffold delphi into a project.
 *
 * The plan is computed first and written second, so `--dry-run` runs exactly the code
 * that a real run would — not an approximation that can drift from it.
 */
export function initCommand(): Command {
  return new Command('init')
    .description('set this project up to work as a department')
    .option('--team <name>', 'team template whose seats get an agent definition')
    .option('--yes', 'do not ask; accept the defaults')
    .option('--force', 'also replace files you own, such as .delphi/config.yaml')
    .option('--dry-run', 'show what would change and write nothing')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const root = findProjectRoot()
      if (!root) {
        throw new UserError(
          'not inside a project',
          'run this from a git repository, or `git init` first so delphi knows where the project starts',
        )
      }

      const plan = await planWithDisk(root, {
        ...(options.team ? { team: options.team as string } : {}),
        force: Boolean(options.force),
      })
      const pending = pendingWrites(plan)

      if (!options.dryRun) {
        for (const write of pending) await writeOne(root, write)
      }

      report.emit(
        {
          root,
          team: plan.team,
          seats: plan.seats,
          dryRun: Boolean(options.dryRun),
          writes: pending.map(({ path, action, note }) => ({ path, action, ...(note ? { note } : {}) })),
          unchanged: plan.writes.length - pending.length,
          notes: plan.notes,
        },
        () => printHuman(report, plan, pending, Boolean(options.dryRun)),
      )
    })
}

/**
 * Read the files the plan cares about, then plan again with them.
 *
 * Planning once against nothing tells us which paths matter, which is cheaper and more
 * exact than walking the project tree looking for files that might be relevant.
 */
async function planWithDisk(root: string, options: { team?: string; force?: boolean }): Promise<InitPlan> {
  const probe = planInit({ existing: {}, ...options })
  const existing: Record<string, string> = {}

  for (const write of probe.writes) {
    try {
      existing[write.path] = await readFile(join(root, write.path), 'utf8')
    } catch {
      // Absent is the normal case on a first run.
    }
  }
  // .gitignore only appears in the plan when something is missing from it, so it has to
  // be read separately or an existing one would be replaced rather than appended to.
  try {
    existing['.gitignore'] = await readFile(join(root, '.gitignore'), 'utf8')
  } catch {
    // ignore
  }

  return planInit({ existing, ...options })
}

async function writeOne(root: string, write: PlannedWrite): Promise<void> {
  const target = join(root, write.path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, write.content, 'utf8')
}

function printHuman(
  report: ReturnType<typeof createReporter>,
  plan: InitPlan,
  pending: PlannedWrite[],
  dryRun: boolean,
): void {
  if (pending.length === 0) {
    report.line('Everything is already in place. Nothing to do.')
    return
  }

  report.line(dryRun ? 'Would write:' : 'Wrote:')
  report.line()
  const verb: Record<string, string> = {
    create: 'new',
    regenerate: 'updated',
    merge: 'merged',
    keep: 'kept',
  }
  for (const line of columns(
    pending.map((w) => [`  ${verb[w.action] ?? w.action}`, w.path, w.note ? `— ${w.note}` : '']),
  )) {
    report.line(line)
  }

  const unchanged = plan.writes.length - pending.length
  if (unchanged > 0) report.line(`\n  ${plural(unchanged, 'file')} already current.`)

  if (plan.notes.length > 0) {
    report.line('\nWorth knowing:')
    for (const note of plan.notes) report.line(`  · ${note}`)
  }

  report.line(`\nSeats: ${plan.seats.join(', ')}`)
  report.line(
    dryRun
      ? '\nRun without --dry-run to apply.'
      : '\nNext: `delphi doctor` to check the setup, then talk to the orchestrator.',
  )
}

export { EXIT }
