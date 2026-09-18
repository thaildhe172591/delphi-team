import { parse } from 'yaml'
import { buildRole } from '../roles/build.js'
import type { Config } from '../schema/config.js'
import { ConfigSchema } from '../schema/config.js'
import {
  listCapabilities,
  listRoles,
  listSkills,
  listTeams,
  readCapability,
  readProtocol,
  readRole,
  readSampleConfig,
  readTeam,
  readTemplate,
} from '../templates/index.js'
import { mergeClaudeMd } from './claudemd.js'
import { mergeGitattributes } from './gitattributes.js'
import { mergeDelphiHooks, type Settings } from './settings.js'

/**
 * Work out exactly what `delphi init` would write, without writing anything.
 *
 * Pure on purpose: the caller supplies the files that already exist and receives the
 * list of writes. That makes `--dry-run` the same code path as the real run rather than
 * an approximation of it, and it makes every overwrite rule testable.
 */

export type FileAction =
  /** Did not exist. */
  | 'create'
  /** Exists and is regenerated: the package owns this file. */
  | 'regenerate'
  /** Exists and is combined with what is there. */
  | 'merge'
  /** Exists and is left alone: the user owns this file. */
  | 'keep'

export interface PlannedWrite {
  /** Relative to the project root, with forward slashes. */
  path: string
  content: string
  action: FileAction
  note?: string
}

export interface InitInput {
  /** Contents of files that already exist, keyed by relative path with forward slashes. */
  existing: Record<string, string>
  /** Team template whose seats get an agent definition. Defaults to the config default. */
  team?: string
  /** How the hooks will invoke the CLI. */
  cliCommand?: string
  /** Regenerate user-owned files too. */
  force?: boolean
}

export interface InitPlan {
  writes: PlannedWrite[]
  /** Things the user should know, for the summary. */
  notes: string[]
  /** The team whose seats were scaffolded. */
  team: string
  seats: string[]
}

const GITIGNORE_LINES = ['.delphi/logs/', '.delphi/tmp/']

export function planInit(input: InitInput): InitPlan {
  const existing = input.existing
  const cliCommand = input.cliCommand ?? 'delphi'
  const writes: PlannedWrite[] = []
  const notes: string[] = []

  const config = resolveConfig(existing)
  const teamName = input.team ?? config.defaults.team
  const team = readTeam(teamName)
  const seats = team.seats.map((s) => s.seat)

  // --- files the package owns: always current, so an upgrade fixes them --------------
  writes.push(packageFile('.delphi/PROTOCOL.md', readProtocol(), existing))

  for (const role of listRoles()) {
    writes.push(packageFile(`.delphi/roles/${role}.md`, rawRole(role), existing))
  }
  for (const id of listCapabilities()) {
    writes.push(packageFile(`.delphi/capabilities/${id}.md`, readTemplate(`capabilities/${id}.md`), existing))
  }
  for (const name of listTeams()) {
    writes.push(packageFile(`.delphi/teams/${name}.yaml`, readTemplate(`teams/${name}.yaml`), existing))
  }
  for (const name of listSkills()) {
    writes.push(
      packageFile(`.claude/skills/${name}/SKILL.md`, readTemplate(`skills/${name}/SKILL.md`), existing),
    )
  }

  // --- files the user owns: written once, then theirs -------------------------------
  writes.push(userFile('.delphi/config.yaml', readSampleConfig(), existing, input.force))
  writes.push(userFile('.delphi/index.yaml', 'version: 1\nprojects: []\n', existing, input.force))
  writes.push(
    userFile('docs/project-context.md', readTemplate('artifacts/project-context.md'), existing, input.force),
  )

  // --- the seats: regenerated, but the project block inside each is the user's -------
  for (const seat of seats) {
    const path = `.claude/agents/${seat}.md`
    const previous = existing[path]
    const seatConfig = config.seats[seat]
    const built = buildRole({
      seat,
      base: readRole(seatConfig?.base ?? seat),
      capabilities: (seatConfig?.capabilities ?? []).map(readCapability),
      modelDefaults: config.models[seat],
      seatConfig,
      existing: previous,
    })
    for (const warning of built.warnings) notes.push(warning)
    writes.push(
      previous === built.content
        ? { path, content: built.content, action: 'keep' }
        : {
            path,
            content: built.content,
            action: previous === undefined ? 'create' : 'regenerate',
            ...(previous === undefined ? {} : { note: 'your project block is preserved' }),
          },
    )
  }

  // --- files that belong to the user but need a delphi section in them ---------------
  const claudeMd = mergeClaudeMd(existing['CLAUDE.md'] ?? '')
  writes.push({
    path: 'CLAUDE.md',
    content: claudeMd.content,
    action:
      existing['CLAUDE.md'] === undefined ? 'create' : claudeMd.change === 'unchanged' ? 'keep' : 'merge',
    note: 'imports .delphi/PROTOCOL.md so every session loads the protocol',
  })

  const gitattributes = mergeGitattributes(existing['.gitattributes'] ?? '')
  writes.push({
    path: '.gitattributes',
    content: gitattributes.content,
    action:
      existing['.gitattributes'] === undefined
        ? 'create'
        : gitattributes.change === 'unchanged'
          ? 'keep'
          : 'merge',
    note: 'keeps the ledger LF, so git on Windows does not report it as wholly changed',
  })

  const settingsPath = '.claude/settings.json'
  const currentSettings = parseSettings(existing[settingsPath])
  const merged = mergeDelphiHooks(currentSettings, cliCommand)
  const settingsContent = `${JSON.stringify(merged.settings, null, 2)}\n`
  writes.push({
    path: settingsPath,
    content: settingsContent,
    // An unchanged file is not a write. Without this, every init rewrites settings.json
    // and a `--dry-run` claims a change it would not make.
    action:
      existing[settingsPath] === undefined
        ? 'create'
        : existing[settingsPath] === settingsContent
          ? 'keep'
          : 'merge',
    note: merged.changes.join(', '),
  })

  const gitignore = mergeGitignore(existing['.gitignore'])
  if (gitignore) {
    writes.push({
      path: '.gitignore',
      content: gitignore,
      action: existing['.gitignore'] === undefined ? 'create' : 'merge',
      note: 'hook logs and scratch files are not committed',
    })
  }

  if (config.models.orchestrator?.model === 'fable') {
    notes.push(
      'the orchestrator defaults to fable, which can bill to usage credits depending on your plan and seat tier',
    )
  }
  notes.push(
    `${seats.length} seats scaffolded from the "${teamName}" team; edit .delphi/config.yaml to change them`,
  )

  return { writes, notes, team: teamName, seats }
}

/** Only the writes that actually change something on disk. */
export function pendingWrites(plan: InitPlan): PlannedWrite[] {
  return plan.writes.filter((write) => write.action !== 'keep')
}

function packageFile(path: string, content: string, existing: Record<string, string>): PlannedWrite {
  const previous = existing[path]
  if (previous === content) return { path, content, action: 'keep' }
  return {
    path,
    content,
    action: previous === undefined ? 'create' : 'regenerate',
    ...(previous === undefined ? {} : { note: 'delphi owns this file' }),
  }
}

function userFile(
  path: string,
  content: string,
  existing: Record<string, string>,
  force?: boolean,
): PlannedWrite {
  const previous = existing[path]
  if (previous === undefined) return { path, content, action: 'create' }
  if (force) return { path, content, action: 'regenerate', note: 'replaced because --force was given' }
  return { path, content: previous, action: 'keep', note: 'yours; left as it is' }
}

/** The base role file as shipped, frontmatter and all. */
function rawRole(name: string): string {
  const direct = `roles/${name}.md`
  try {
    return readTemplate(direct)
  } catch {
    return readTemplate(`roles/optional/${name}.md`)
  }
}

function resolveConfig(existing: Record<string, string>): Config {
  const text = existing['.delphi/config.yaml'] ?? readSampleConfig()
  const parsed = ConfigSchema.safeParse(parse(text))
  // A config that does not parse is reported by `doctor`; init should still be able to
  // scaffold rather than refusing to run because of a file it is about to fix.
  return parsed.success ? parsed.data : ConfigSchema.parse(parse(readSampleConfig()))
}

function parseSettings(text: string | undefined): Settings {
  if (!text || text.trim() === '') return {}
  try {
    const parsed = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Settings) : {}
  } catch {
    // Refusing here would leave the user with a half-installed project. Report it in the
    // note instead, and let `doctor` be the one that complains loudly.
    return {}
  }
}

/** Append only the lines that are missing, preserving everything else byte for byte. */
function mergeGitignore(existing: string | undefined): string | null {
  const current = existing ?? ''
  const lines = new Set(current.split('\n').map((line) => line.trim()))
  const missing = GITIGNORE_LINES.filter((line) => !lines.has(line))
  if (missing.length === 0) return null
  const prefix = current === '' ? '' : current.endsWith('\n') ? current : `${current}\n`
  return `${prefix}\n# delphi-team\n${missing.join('\n')}\n`
}
