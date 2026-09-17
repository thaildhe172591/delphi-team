import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  buildRole,
  ConfigSchema,
  listCapabilities,
  listRoles,
  listTeams,
  readCapability,
  readRole,
  readTeam,
  readTemplate,
  writeAtomic,
} from '@delphi-team/core'
import { Command } from 'commander'
import { parse, stringify } from 'yaml'
import { type Context, requireInitialised, UserError } from '../context.js'
import { columns, createReporter } from '../output.js'

/**
 * Seats are composed, never hand-written: base role plus capability packs plus the block
 * of project notes that belongs to the user. Everything here goes through that path, so a
 * seat edited by hand is regenerated rather than quietly diverging.
 */

async function buildSeat(context: Context, seat: string): Promise<{ content: string; warnings: string[] }> {
  const seatConfig = context.config.seats[seat]
  const base = seatConfig?.base ?? seat

  if (!listRoles().includes(base)) {
    throw new UserError(`no base role "${base}"`, `available: ${listRoles().join(', ')}`)
  }

  const path = context.paths.agent(seat)
  const existing = existsSync(path) ? await readFile(path, 'utf8') : undefined

  const built = buildRole({
    seat,
    base: readRole(base),
    capabilities: (seatConfig?.capabilities ?? []).map((id) => {
      try {
        return readCapability(id)
      } catch {
        throw new UserError(
          `no capability "${id}", which ${seat} asks for`,
          `available: ${listCapabilities().join(', ')}`,
        )
      }
    }),
    modelDefaults: context.config.models[seat],
    seatConfig,
    existing,
  })
  return { content: built.content, warnings: built.warnings }
}

async function saveConfig(
  context: Context,
  mutate: (config: Record<string, unknown>) => void,
): Promise<void> {
  const raw = parse(await readFile(context.paths.config, 'utf8')) as Record<string, unknown>
  mutate(raw)
  ConfigSchema.parse(raw)
  await writeAtomic(context.paths.config, stringify(raw))
}

export function roleCommand(): Command {
  const role = new Command('role').description('the seats in this department')

  role
    .command('list')
    .description('seats that exist, and what they are made of')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const built = existsSync(context.paths.agents)
        ? (await readdir(context.paths.agents)).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3))
        : []

      const rows = built.map((seat) => {
        const config = context.config.seats[seat]
        return {
          seat,
          base: config?.base ?? seat,
          capabilities: config?.capabilities ?? [],
          model: context.config.models[seat]?.model ?? config?.model ?? '(default)',
        }
      })

      report.emit({ built: rows, available: listRoles() }, () => {
        if (rows.length === 0) {
          report.line('No seats built yet. Run `delphi init`.')
          return
        }
        for (const line of columns(
          rows.map((r) => [
            `  ${r.seat}`,
            r.model,
            r.capabilities.length > 0 ? `+ ${r.capabilities.join(', ')}` : '',
          ]),
        )) {
          report.line(line)
        }
        report.line(`\nBase roles available: ${listRoles().join(', ')}`)
      })
    })

  role
    .command('add <seat>')
    .description('give a seat a capability')
    .requiredOption('--capability <id>')
    .option('--dry-run', 'show the change and write nothing')
    .option('--json', 'machine-readable output')
    .action(async (seat: string, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const id = options.capability as string

      if (!listCapabilities().includes(id)) {
        throw new UserError(`no capability "${id}"`, `available: ${listCapabilities().join(', ')}`)
      }

      const capability = readCapability(id).meta
      const base = context.config.seats[seat]?.base ?? seat
      if (!capability.applies_to.includes('*') && !capability.applies_to.includes(base)) {
        throw new UserError(
          `${id} does not apply to ${base}`,
          `it applies to: ${capability.applies_to.join(', ')}`,
        )
      }

      if (!options.dryRun) {
        await saveConfig(context, (raw) => {
          raw.seats ??= {}
          const seats = raw.seats as Record<string, { base?: string; capabilities?: string[] }>
          seats[seat] ??= { base }
          const entry = seats[seat] as { base?: string; capabilities?: string[] }
          entry.capabilities = [...new Set([...(entry.capabilities ?? []), id])]
        })
        const refreshed = await requireInitialised()
        const built = await buildSeat(refreshed, seat)
        await writeAtomic(refreshed.paths.agent(seat), built.content)
        report.emit({ seat, capability: id, warnings: built.warnings }, () => {
          report.line(`${seat} now has ${id}.`)
          for (const w of built.warnings) report.line(`  · ${w}`)
          report.line(`\nA running ${seat} session will not pick this up. Restart it.`)
        })
        return
      }

      report.emit({ seat, capability: id, dryRun: true }, () => {
        report.line(`Would add ${id} to ${seat} and rebuild the seat.`)
        if (capability.risk === 'high') report.line(`  ${id} is marked high risk.`)
      })
    })

  role
    .command('remove <seat>')
    .description('take a capability away from a seat')
    .requiredOption('--capability <id>')
    .option('--json', 'machine-readable output')
    .action(async (seat: string, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      await saveConfig(context, (raw) => {
        const seats = (raw.seats ?? {}) as Record<string, { capabilities?: string[] }>
        const entry = seats[seat]
        if (entry?.capabilities) {
          entry.capabilities = entry.capabilities.filter((c) => c !== options.capability)
        }
      })
      const refreshed = await requireInitialised()
      const built = await buildSeat(refreshed, seat)
      await writeAtomic(refreshed.paths.agent(seat), built.content)
      report.emit({ seat, removed: options.capability }, () =>
        report.line(`${seat} no longer has ${options.capability}. Restart that session.`),
      )
    })

  role
    .command('build [seat]')
    .description('regenerate a seat from its base role and capabilities')
    .option('--all', 'every seat that exists')
    .option('--dry-run', 'show what would change and write nothing')
    .option('--json', 'machine-readable output')
    .action(async (seat: string | undefined, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()

      const seats = options.all
        ? (await readdir(context.paths.agents)).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3))
        : seat
          ? [seat]
          : []
      if (seats.length === 0) throw new UserError('name a seat, or pass --all')

      const results: Array<{ seat: string; changed: boolean; warnings: string[] }> = []
      for (const name of seats) {
        const built = await buildSeat(context, name)
        const path = context.paths.agent(name)
        const current = existsSync(path) ? await readFile(path, 'utf8') : null
        const changed = current !== built.content
        if (changed && !options.dryRun) await writeAtomic(path, built.content)
        results.push({ seat: name, changed, warnings: built.warnings })
      }

      report.emit({ dryRun: Boolean(options.dryRun), results }, () => {
        for (const r of results) {
          report.line(
            `  ${r.changed ? (options.dryRun ? 'would update' : 'updated') : 'unchanged'}  ${r.seat}`,
          )
          for (const w of r.warnings) report.line(`      · ${w}`)
        }
        report.line('\nYour project block inside each seat is preserved.')
      })
    })

  return role
}

export function capabilityCommand(): Command {
  const capability = new Command('capability').description('capability packs')

  capability
    .command('list')
    .description('packs that ship with delphi, and what they need')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const packs = listCapabilities().map((id) => readCapability(id).meta)
      report.emit(packs, () => {
        for (const line of columns(
          packs.map((c) => [
            `  ${c.id}`,
            c.risk,
            c.title,
            c.requires.commands.length > 0 ? `needs ${c.requires.commands.join(', ')}` : '',
          ]),
        )) {
          report.line(line)
        }
      })
    })

  capability
    .command('new <id>')
    .description('start a capability pack of your own')
    .option('--json', 'machine-readable output')
    .action(async (id: string, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const target = join(context.paths.capabilities, `${id}.md`)
      if (existsSync(target)) throw new UserError(`${target} already exists`)

      // Start from the Pythia pack: it is the fullest worked example of the shape.
      const template = readTemplate('capabilities/pythia-oracle.md')
        .replace(/^id: .*$/m, `id: ${id}`)
        .replace(/^title: .*$/m, `title: ${id}`)
      await writeFile(target, template, 'utf8')

      report.emit({ id, path: target }, () => {
        report.line(`Created ${target}.`)
        report.line(`Edit it, then add it to a seat with \`delphi role add <seat> --capability ${id}\`.`)
      })
    })

  return capability
}

export function teamCommand(): Command {
  const team = new Command('team').description('team templates')

  team
    .command('list')
    .description('team templates that ship with delphi')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const teams = listTeams().map((name) => readTeam(name))
      report.emit(teams, () => {
        for (const line of columns(
          teams.map((t) => [
            `  ${t.name}`,
            `${t.seats.length} seats`,
            `max ${t.limits.max_active} active`,
            t.description,
          ]),
        )) {
          report.line(line)
        }
      })
    })

  return team
}
