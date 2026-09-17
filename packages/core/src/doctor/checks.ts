import type { Config } from '../schema/config.js'
import type { Capability } from '../schema/role.js'
import { MIN_CLAUDE_VERSION, satisfiesMinimum } from '../version.js'

/**
 * What `delphi doctor` checks, as a pure function over facts the CLI gathers.
 *
 * Keeping the judgement separate from the gathering means every rule is testable without
 * a filesystem, a Claude Code install, or a particular operating system — and the rules
 * are where the value is.
 */

export type Level = 'ok' | 'warn' | 'fail'

export interface Check {
  id: string
  level: Level
  title: string
  /** What was found. */
  detail?: string
  /** What to do about it. */
  fix?: string
}

export interface DoctorFacts {
  /** From `claude --version`, or null when it is not on PATH. */
  claudeVersion: string | null
  /** Whether `.delphi` exists. */
  initialised: boolean
  config: Config | null
  /** A parse error from config.yaml, if any. */
  configError?: string
  /** Seat ids with a generated `.claude/agents/<seat>.md`. */
  seats: string[]
  /** Frontmatter descriptions, by seat, for the budget check. */
  descriptions: Record<string, string>
  /** Seats whose `owns` globs overlap. */
  ownershipConflicts: Array<{ glob: string; seats: string[] }>
  /** Capabilities each seat has merged in. */
  seatCapabilities: Record<string, Capability[]>
  /** Commands found on PATH. */
  commandsOnPath: Record<string, boolean>
  /** Whether the delphi hooks are installed in settings. */
  hooksInstalled: boolean
  /** `~/.claude/keybindings.json` contents, or null when the file does not exist. */
  keybindings: string | null
  /** Environment variables that change how a department can run. */
  env: Record<string, string | undefined>
  /** Age in hours of STATE.md and the newest checkpoint, per open project. */
  projects: Array<{
    slug: string
    stateAgeHours: number | null
    checkpointAgeHours: number | null
    openTasks: number
  }>
  platform: NodeJS.Platform
}

/** How stale is too stale before it is worth saying something. */
const STATE_STALE_HOURS = 24
const CHECKPOINT_STALE_HOURS = 72

export function runChecks(facts: DoctorFacts): Check[] {
  const checks: Check[] = []

  // --- Claude Code itself -----------------------------------------------------------
  if (facts.claudeVersion === null) {
    checks.push({
      id: 'claude-code',
      level: 'fail',
      title: 'Claude Code is not on PATH',
      fix: 'install it, or make sure `claude` is reachable from this shell',
    })
  } else if (!satisfiesMinimum(facts.claudeVersion)) {
    checks.push({
      id: 'claude-code',
      level: 'warn',
      title: `Claude Code ${facts.claudeVersion} is older than ${MIN_CLAUDE_VERSION}`,
      detail: 'delphi was verified against that version; older ones may behave differently',
      fix: 'run `claude update`',
    })
  } else {
    checks.push({ id: 'claude-code', level: 'ok', title: `Claude Code ${facts.claudeVersion}` })
  }

  // --- the project ------------------------------------------------------------------
  if (!facts.initialised) {
    checks.push({
      id: 'initialised',
      level: 'fail',
      title: 'this project is not set up',
      fix: 'run `delphi init`',
    })
    return checks
  }

  if (facts.configError) {
    checks.push({
      id: 'config',
      level: 'fail',
      title: '.delphi/config.yaml does not match the schema',
      detail: facts.configError,
      fix: 'fix the file, or move it aside and run `delphi init` to write a fresh one',
    })
  } else {
    checks.push({ id: 'config', level: 'ok', title: 'config is valid' })
  }

  checks.push(
    facts.hooksInstalled
      ? { id: 'hooks', level: 'ok', title: 'hooks are installed' }
      : {
          id: 'hooks',
          level: 'warn',
          title: 'delphi hooks are not in .claude/settings.json',
          detail: 'seats will not receive their state at session start',
          fix: 'run `delphi init`',
        },
  )

  // --- the seats --------------------------------------------------------------------
  if (facts.seats.length === 0) {
    checks.push({
      id: 'seats',
      level: 'warn',
      title: 'no seats are built',
      fix: 'run `delphi init` or `delphi role build --all`',
    })
  } else {
    checks.push({ id: 'seats', level: 'ok', title: `${facts.seats.length} seats built` })
  }

  for (const conflict of facts.ownershipConflicts) {
    checks.push({
      id: `owns:${conflict.glob}`,
      level: 'fail',
      title: `${conflict.seats.join(' and ')} both own ${conflict.glob}`,
      detail: 'two seats editing one path is the failure that costs a whole shift',
      fix: 'give the path to one seat in .delphi/config.yaml',
    })
  }

  // Claude Code trims agent and skill descriptions to a token budget, so a wall of long
  // ones means some seats become invisible to the orchestrator.
  const totalDescription = Object.values(facts.descriptions).reduce((n, d) => n + d.length, 0)
  if (totalDescription > 4000) {
    checks.push({
      id: 'descriptions',
      level: 'warn',
      title: `seat descriptions total ${totalDescription} characters`,
      detail: 'Claude Code trims descriptions to a budget; long ones crowd each other out',
      fix: 'shorten the longest descriptions in .delphi/roles/',
    })
  }

  // --- what capabilities need -------------------------------------------------------
  for (const [seat, capabilities] of Object.entries(facts.seatCapabilities)) {
    for (const capability of capabilities) {
      for (const command of capability.requires.commands) {
        if (facts.commandsOnPath[command] === false) {
          checks.push({
            id: `requires:${seat}:${command}`,
            level: 'fail',
            title: `${seat} needs \`${command}\` on PATH for the ${capability.id} capability`,
            fix: `install ${command}, or remove ${capability.id} from ${seat} in .delphi/config.yaml`,
          })
        }
      }
      for (const skill of capability.requires.skills) {
        checks.push({
          id: `requires:${seat}:skill:${skill}`,
          level: 'warn',
          title: `${seat} needs the \`${skill}\` skill for ${capability.id}`,
          detail:
            'a teammate never receives skills from frontmatter, so it must exist at project or user level',
        })
      }
      for (const server of capability.requires.mcp_servers) {
        checks.push({
          id: `requires:${seat}:mcp:${server}`,
          level: 'warn',
          title: `${seat} needs the \`${server}\` MCP server for ${capability.id}`,
          detail: 'configure it in project or user settings; an in-process teammate does not inherit it',
        })
      }
    }
  }

  // --- how a department can actually run --------------------------------------------
  if (facts.config?.dispatch.mode === 'teams' || facts.config?.dispatch.mode === 'auto') {
    if (facts.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS !== '1') {
      checks.push({
        id: 'agent-teams',
        level: 'warn',
        title: 'Agent Teams is not enabled',
        detail: 'teams mode is unavailable; dispatch will fall back to background sessions or manual',
        fix: 'set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1',
      })
    } else if (facts.env.CLAUDE_CODE_ENABLE_TODO_TOOLS !== '1') {
      // The shared task list is not free: the task tools are off by default on newer models.
      checks.push({
        id: 'task-tools',
        level: 'warn',
        title: 'the shared task list will be empty',
        detail: 'the Task tools are not available by default on current models',
        fix: 'set CLAUDE_CODE_ENABLE_TODO_TOOLS=1, or rely on board.yaml, which delphi does anyway',
      })
    }
  }

  // --- images, on Windows -----------------------------------------------------------
  if (facts.platform === 'win32') {
    const rebound = facts.keybindings?.includes('chat:imagePaste') ?? false
    checks.push({
      id: 'image-paste',
      level: 'ok',
      title: rebound
        ? 'clipboard image paste is rebound in ~/.claude/keybindings.json'
        : 'clipboard image paste is Alt+V (the Windows default)',
      // No keybindings file is the normal, working case: the default binding applies.
      ...(rebound ? { detail: 'check the binding if pasting an image does not work' } : {}),
    })
  }

  // --- how the orchestrator bills ---------------------------------------------------
  if (facts.config?.models.orchestrator?.model === 'fable') {
    checks.push({
      id: 'orchestrator-billing',
      level: 'warn',
      title: 'the orchestrator runs on fable',
      detail: 'depending on your plan and seat tier, that can bill to usage credits',
      fix: 'change models.orchestrator in .delphi/config.yaml if you would rather it did not',
    })
  }

  // --- is the ledger keeping up -----------------------------------------------------
  for (const project of facts.projects) {
    if (
      project.openTasks > 0 &&
      project.stateAgeHours !== null &&
      project.stateAgeHours > STATE_STALE_HOURS
    ) {
      checks.push({
        id: `state:${project.slug}`,
        level: 'warn',
        title: `${project.slug}: STATE.md is ${Math.round(project.stateAgeHours)} hours old with ${project.openTasks} tasks open`,
        fix: 'run `/resume` and let the orchestrator reconcile it',
      })
    }
    if (project.checkpointAgeHours !== null && project.checkpointAgeHours > CHECKPOINT_STALE_HOURS) {
      checks.push({
        id: `checkpoint:${project.slug}`,
        level: 'warn',
        title: `${project.slug}: the newest checkpoint is ${Math.round(project.checkpointAgeHours / 24)} days old`,
        fix: 'run `/checkpoint` at the end of the next shift',
      })
    }
  }

  return checks
}

export function worstLevel(checks: Check[]): Level {
  if (checks.some((c) => c.level === 'fail')) return 'fail'
  if (checks.some((c) => c.level === 'warn')) return 'warn'
  return 'ok'
}
