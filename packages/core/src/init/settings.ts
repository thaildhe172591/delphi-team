/**
 * Merge delphi hooks into a user's `.claude/settings.json` without damaging what is
 * already there.
 *
 * JSON has no comments, so delphi cannot bracket its entries with markers the way it does
 * in Markdown. Instead every entry it owns is recognisable by its command: they all invoke
 * the delphi CLI. That makes the merge idempotent, the upgrade a replace, and the removal a
 * filter, without inventing a field Claude Code might later reject.
 */

/** The hook events delphi installs, and what each one is for. */
export const DELPHI_HOOKS = {
  SessionStart: {
    // Five sources, not four: `fork` was added in 2.1.214 and a handler that enumerates
    // only startup/resume/clear/compact silently does nothing for a forked session.
    purpose: 'load the seat, the project state and the unread inbox into a new session',
    timeout: 10,
  },
  PreCompact: {
    // PreCompact can block but cannot inject, so this writes a checkpoint as a side
    // effect rather than trying to remind anyone of anything.
    purpose: 'write a checkpoint before context is compacted away',
    timeout: 15,
  },
  PreToolUse: {
    purpose: 'keep the orchestrator out of source code',
    // `Edit.*` would also match NotebookEdit, so the matcher is anchored.
    matcher: '^(Edit|Write|NotebookEdit)$',
    timeout: 5,
  },
  SubagentStop: {
    // The signal that actually arrives. A spike with Agent Teams enabled produced
    // background subagents rather than teammates, so TaskCreated/TaskCompleted/TeammateIdle
    // never fired -- but SubagentStop did, and it carries `last_assistant_message`, which
    // is the seat's closing report. See .build/VERIFY.md spike 5.
    purpose: 'record what each seat concluded when it stopped',
    timeout: 10,
  },
} as const

export type DelphiHookEvent = keyof typeof DELPHI_HOOKS

interface HookHandler {
  type: string
  command?: string
  timeout?: number
  [key: string]: unknown
}

interface HookGroup {
  matcher?: string
  hooks: HookHandler[]
  [key: string]: unknown
}

export interface Settings {
  hooks?: Record<string, HookGroup[]>
  [key: string]: unknown
}

export interface MergeResult {
  settings: Settings
  /** What changed, in words, for the dry-run diff. */
  changes: string[]
}

/** True when this handler is one delphi installed. */
export function isDelphiHandler(handler: HookHandler, command: string): boolean {
  return typeof handler.command === 'string' && handler.command.startsWith(command)
}

/**
 * Add or refresh delphi's hooks.
 *
 * Running it twice produces the same file: entries delphi owns are replaced, and
 * everything else is left exactly as it was found.
 */
export function mergeDelphiHooks(settings: Settings, cliCommand = 'delphi'): MergeResult {
  const changes: string[] = []
  const hooks: Record<string, HookGroup[]> = { ...(settings.hooks ?? {}) }

  for (const [event, spec] of Object.entries(DELPHI_HOOKS)) {
    const matcher = 'matcher' in spec ? (spec.matcher as string) : undefined
    const handler: HookHandler = {
      type: 'command',
      command: `${cliCommand} hook ${event}`,
      timeout: spec.timeout,
    }

    const existing = hooks[event] ?? []
    // Drop the delphi handlers, keep everyone else, then drop any group we emptied.
    const kept = existing
      .map((group) => ({
        ...group,
        hooks: group.hooks.filter((h) => !isDelphiHandler(h, `${cliCommand} hook `)),
      }))
      .filter((group) => group.hooks.length > 0)

    const had =
      existing.length !== kept.length || existing.some((g, i) => g.hooks.length !== kept[i]?.hooks.length)

    hooks[event] = [...kept, matcher ? { matcher, hooks: [handler] } : { hooks: [handler] }]
    changes.push(had ? `refresh hook ${event}` : `add hook ${event} — ${spec.purpose}`)
  }

  return { settings: { ...settings, hooks }, changes }
}

/** Remove every hook delphi installed, leaving the rest of the file untouched. */
export function removeDelphiHooks(settings: Settings, cliCommand = 'delphi'): MergeResult {
  const changes: string[] = []
  const hooks: Record<string, HookGroup[]> = {}

  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    const kept = groups
      .map((group) => ({
        ...group,
        hooks: group.hooks.filter((h) => !isDelphiHandler(h, `${cliCommand} hook `)),
      }))
      .filter((group) => group.hooks.length > 0)

    if (kept.length !== groups.length) changes.push(`remove hook ${event}`)
    if (kept.length > 0) hooks[event] = kept
  }

  const result: Settings = { ...settings }
  if (Object.keys(hooks).length > 0) result.hooks = hooks
  else delete result.hooks

  return { settings: result, changes }
}

/** Is delphi already installed in these settings? */
export function hasDelphiHooks(settings: Settings, cliCommand = 'delphi'): boolean {
  return Object.values(settings.hooks ?? {}).some((groups) =>
    groups.some((group) => group.hooks.some((h) => isDelphiHandler(h, `${cliCommand} hook `))),
  )
}
