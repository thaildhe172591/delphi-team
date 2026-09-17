import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  BoardSchema,
  type Capability,
  type Check,
  ClaudeAdapter,
  type DoctorFacts,
  findOwnershipConflicts,
  hasDelphiHooks,
  type Level,
  openTasks,
  ProjectIndexSchema,
  readCapability,
  readYaml,
  runChecks,
  worstLevel,
} from '@delphi-team/core'
import { Command } from 'commander'
import { execa } from 'execa'
import matter from 'gray-matter'
import { type Context, loadContext } from '../context.js'
import { createReporter, EXIT } from '../output.js'

/** Check that this project can actually run a department, and say what to fix if not. */
export function doctorCommand(): Command {
  return new Command('doctor')
    .description('check that the setup is sound')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await loadContext()
      const facts = await gather(context)
      const checks = runChecks(facts)
      const level = worstLevel(checks)

      report.emit({ level, checks }, () => print(report, checks, level))
      if (level === 'fail') process.exitCode = EXIT.invalidState
    })
}

async function gather(context: Context): Promise<DoctorFacts> {
  const { paths, config, initialised } = context

  const seats: string[] = []
  const descriptions: Record<string, string> = {}
  const seatCapabilities: Record<string, Capability[]> = {}

  if (initialised && existsSync(paths.agents)) {
    for (const file of await readdir(paths.agents)) {
      if (!file.endsWith('.md')) continue
      const seat = file.slice(0, -3)
      seats.push(seat)
      const { data } = matter(await readFile(join(paths.agents, file), 'utf8'))
      descriptions[seat] = typeof data.description === 'string' ? data.description : ''
    }
  }

  for (const [seat, seatConfig] of Object.entries(config.seats)) {
    seatCapabilities[seat] = (seatConfig.capabilities ?? []).flatMap((id) => {
      try {
        return [readCapability(id).meta]
      } catch {
        // An unknown capability id is reported by `role build`, not here.
        return []
      }
    })
  }

  const required = new Set(
    Object.values(seatCapabilities).flatMap((list) => list.flatMap((c) => c.requires.commands)),
  )
  const commandsOnPath: Record<string, boolean> = {}
  for (const command of required) commandsOnPath[command] = await onPath(command)

  return {
    claudeVersion: await new ClaudeAdapter().version(),
    initialised,
    config: initialised ? config : null,
    seats,
    descriptions,
    ownershipConflicts: findOwnershipConflicts(config.seats),
    seatCapabilities,
    commandsOnPath,
    hooksInstalled: await settingsHaveHooks(context),
    keybindings: await readIfPresent(join(homedir(), '.claude', 'keybindings.json')),
    env: process.env,
    projects: initialised ? await projectHealth(context) : [],
    platform: process.platform,
  }
}

/** Is it runnable? execa resolves a Windows `.cmd` shim without a shell, which matters here. */
async function onPath(command: string): Promise<boolean> {
  try {
    await execa(command, ['--version'], { timeout: 10_000, input: '' })
    return true
  } catch (error) {
    // A non-zero exit still means the binary exists; only a spawn failure means it does not.
    return (error as { code?: string }).code !== 'ENOENT'
  }
}

async function settingsHaveHooks(context: Context): Promise<boolean> {
  for (const file of ['settings.json', 'settings.local.json']) {
    const text = await readIfPresent(join(context.root, '.claude', file))
    if (!text) continue
    try {
      if (hasDelphiHooks(JSON.parse(text))) return true
    } catch {
      // A broken settings file is the config check's business, not this one's.
    }
  }
  return false
}

async function projectHealth(context: Context): Promise<DoctorFacts['projects']> {
  const index = await readYaml(context.paths.index, ProjectIndexSchema, { version: 1, projects: [] })
  const out: DoctorFacts['projects'] = []

  for (const entry of index.projects.filter((p) => p.status === 'open')) {
    const project = context.paths.project(entry.slug)
    const board = await readYaml(project.board, BoardSchema, { version: 1, tasks: [] })
    out.push({
      slug: entry.slug,
      stateAgeHours: await ageHours(project.state),
      checkpointAgeHours: await newestCheckpointAge(project.checkpoints),
      openTasks: openTasks(board).length,
    })
  }
  return out
}

async function ageHours(path: string): Promise<number | null> {
  try {
    const info = await stat(path)
    return (Date.now() - info.mtimeMs) / 3_600_000
  } catch {
    return null
  }
}

async function newestCheckpointAge(dir: string): Promise<number | null> {
  try {
    const files = await readdir(dir)
    const ages = (await Promise.all(files.map((f) => ageHours(join(dir, f))))).filter(
      (a): a is number => a !== null,
    )
    return ages.length > 0 ? Math.min(...ages) : null
  } catch {
    return null
  }
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

const MARK = { ok: '  ok  ', warn: ' warn ', fail: ' fail ' } as const

function print(report: ReturnType<typeof createReporter>, checks: Check[], level: Level): void {
  for (const check of checks) {
    report.line(`${MARK[check.level]} ${check.title}`)
    if (check.detail) report.line(`        ${check.detail}`)
    if (check.fix) report.line(`        -> ${check.fix}`)
  }

  const failures = checks.filter((c) => c.level === 'fail').length
  const warnings = checks.filter((c) => c.level === 'warn').length
  report.line()
  if (level === 'ok') report.line('Everything checks out.')
  else report.line(`${failures} to fix, ${warnings} worth knowing about.`)
}
