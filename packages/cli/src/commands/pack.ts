import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { listTemplates, mergeConfigInto, readOr, readTemplate } from '@delphi-team/core'
import { Command } from 'commander'
import { parse } from 'yaml'
import { requireInitialised, UserError } from '../context.js'
import { columns, createReporter } from '../output.js'

/**
 * Ready-made departments: a set of seats, their models, and what each one owns.
 *
 * A pack is the answer to "which seats do I actually need", which is the question a new
 * project cannot answer and an experienced one answers differently every time. It is
 * config, not magic: everything a pack does you could do by editing `.delphi/config.yaml`,
 * and `pack show` prints exactly what it would change.
 *
 * Applying one edits a file the user owns, so it does not, unless told twice. Bare, it
 * prints the diff and stops. `--write` is the second word.
 */

interface Pack {
  name: string
  title: string
  description: string
  when?: string
  seats_added?: string[]
  default_team?: string
  config?: Record<string, unknown>
  notes?: string[]
}

function packNames(): string[] {
  return listTemplates('packs/')
    .filter((path) => path.endsWith('/pack.yaml'))
    .map((path) => path.split('/')[1] as string)
}

function readPack(name: string): Pack {
  if (!packNames().includes(name)) {
    throw new UserError(`no pack called "${name}"`, `there are: ${packNames().join(', ')}`)
  }
  return parse(readTemplate(`packs/${name}/pack.yaml`)) as Pack
}

export function packCommand(): Command {
  const pack = new Command('pack').description('ready-made departments you can start from')

  pack
    .command('list')
    .description('the packs that ship with delphi')
    .option('--json', 'machine-readable output')
    .action((options) => {
      const report = createReporter(Boolean(options.json))
      const packs = packNames().map(readPack)

      report.emit(packs, () => {
        for (const line of columns(packs.map((one) => [`  ${one.name}`, one.title]))) report.line(line)
        report.line('\n`delphi pack show <name>` says what one would change.')
      })
    })

  pack
    .command('show')
    .description('what a pack is for, and exactly what it would change here')
    .argument('<name>')
    .option('--json', 'machine-readable output')
    .action(async (name: string, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const one = readPack(name)
      const plan = await planPack(context.root, one)

      report.emit({ pack: one, ...plan }, () => {
        report.line(`${one.title} — ${one.description}\n`)
        if (one.when) report.line(`${one.when.trim()}\n`)
        report.line(`Seats: ${(one.seats_added ?? []).join(', ')}`)
        if (one.default_team) report.line(`Team: ${one.default_team}`)
        printPlan(report, plan)
        for (const note of one.notes ?? []) report.line(`\n· ${note}`)
      })
    })

  pack
    .command('apply')
    .description('use a pack in this project — prints the diff unless you pass --write')
    .argument('<name>')
    .option('--write', 'actually change the files')
    .option('--json', 'machine-readable output')
    .action(async (name: string, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const one = readPack(name)
      const plan = await planPack(context.root, one)

      if (!options.write) {
        report.emit({ pack: one, ...plan, dryRun: true }, () => {
          report.line(`${one.title} would change this project:`)
          printPlan(report, plan)
          report.line('\nNothing has been written. Run it again with --write to apply.')
        })
        return
      }

      await writeFile(join(context.root, '.delphi', 'config.yaml'), plan.config.content, 'utf8')

      report.emit({ pack: one, ...plan, dryRun: false }, () => {
        report.line(`Applied ${one.title}.`)
        printPlan(report, plan)
        report.line('\nNext: `delphi role build --all` to build the seats, then `delphi doctor`.')
      })
    })

  return pack
}

async function planPack(root: string, one: Pack) {
  const configPath = join(root, '.delphi', 'config.yaml')
  const existing = await readOr(configPath, '')
  if (!existing) throw new UserError('no .delphi/config.yaml here', 'run `delphi init` first')

  // A pack is config and nothing else. Its roles and its team ship as ordinary templates,
  // because `readRole` and `readTeam` read the embedded ones -- a file dropped into
  // `.delphi/roles/` is read by nobody, which is how the first version of this achieved
  // nothing at all.
  return { config: mergeConfigInto(existing, one.config ?? {}) }
}

function printPlan(
  report: ReturnType<typeof createReporter>,
  plan: Awaited<ReturnType<typeof planPack>>,
): void {
  if (plan.config.changes.length === 0) report.line('\nconfig.yaml: already matches this pack')
  else {
    report.line('\nconfig.yaml:')
    for (const line of columns(
      plan.config.changes.map((change) => [`  ${change.path}`, change.from, '->', change.to]),
    )) {
      report.line(line)
    }
  }
}
