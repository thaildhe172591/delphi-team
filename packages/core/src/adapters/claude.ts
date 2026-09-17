import { execa } from 'execa'
import { parseClaudeVersion } from '../version.js'

/**
 * The only place delphi runs the `claude` binary (ADR-0001).
 *
 * Everything here was verified against Claude Code 2.1.274 in Phase 0; see
 * `docs/research/claude-code-capabilities.md`. Argument building is pure and tested
 * separately, so the rules that matter are checked without spawning anything.
 *
 * No shell, ever. On Windows the thing on PATH is a `.cmd` shim, and going through a
 * shell would break the moment a project path contains a space or a non-ASCII character
 * (PACKAGING_SPEC section 4). execa resolves the shim without one.
 */

/** One row of `claude agents --json`. Interactive rows have no `id` and cannot be attached. */
export interface ClaudeAgentEntry {
  cwd: string
  kind: 'interactive' | 'background' | (string & {})
  startedAt: number
  id?: string
  state?: 'working' | 'blocked' | 'done' | 'failed' | 'stopped' | (string & {})
  pid?: number
  status?: 'busy' | 'waiting' | 'idle' | (string & {})
  /** Present while waiting — `"permission prompt"` is how a stuck seat announces itself. */
  waitingFor?: string
  sessionId?: string
  name?: string
}

export interface DispatchOptions {
  prompt: string
  /** The seat, i.e. an agent definition name. */
  agent?: string
  model?: string
  effort?: string
  /** The session's display name; delphi's convention is `<prefix>-<seat>`. */
  name?: string
  permissionMode?: string
  addDirs?: string[]
}

export class ClaudeAdapterError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'ClaudeAdapterError'
  }
}

/**
 * Build the argv for a background dispatch.
 *
 * `--bg` and `-p` are mutually exclusive: Claude Code rejects the combination before the
 * session is even created (C-006). Nothing here may ever emit both.
 */
export function buildDispatchArgs(options: DispatchOptions): string[] {
  if (!options.prompt.trim()) {
    throw new ClaudeAdapterError('a background session needs a prompt')
  }
  const args = ['--bg']
  if (options.agent) args.push('--agent', options.agent)
  if (options.model) args.push('--model', options.model)
  if (options.effort) args.push('--effort', options.effort)
  if (options.name) args.push('--name', options.name)
  if (options.permissionMode) args.push('--permission-mode', options.permissionMode)
  for (const dir of options.addDirs ?? []) args.push('--add-dir', dir)
  args.push(options.prompt)

  if (args.includes('-p') || args.includes('--print')) {
    throw new ClaudeAdapterError('--bg cannot be combined with --print; Claude Code refuses it')
  }
  return args
}

/** `claude --bg` prints `backgrounded · <id> · <name>`; pull the id out of that. */
export function parseDispatchId(output: string): string | null {
  const match = /backgrounded\s*[·|-]\s*([0-9a-f]{6,})/i.exec(output)
  return match?.[1] ?? null
}

export interface ClaudeAdapterOptions {
  /** Defaults to `claude` on PATH. */
  binary?: string
  cwd?: string
  timeout?: number
}

export class ClaudeAdapter {
  private readonly binary: string
  private readonly cwd: string | undefined
  private readonly timeout: number

  constructor(options: ClaudeAdapterOptions = {}) {
    this.binary = options.binary ?? 'claude'
    this.cwd = options.cwd
    this.timeout = options.timeout ?? 60_000
  }

  private async run(args: string[], input?: string): Promise<string> {
    try {
      const result = await execa(this.binary, args, {
        ...(this.cwd ? { cwd: this.cwd } : {}),
        timeout: this.timeout,
        // Claude Code warns and waits when stdin is an unread pipe; be explicit.
        input: input ?? '',
        reject: true,
      })
      return result.stdout
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new ClaudeAdapterError(`\`${this.binary} ${args.join(' ')}\` failed: ${detail}`, error)
    }
  }

  /** The installed version, or null when `claude` is not on PATH. */
  async version(): Promise<string | null> {
    try {
      return parseClaudeVersion(await this.run(['--version']))
    } catch {
      return null
    }
  }

  /**
   * Live sessions. `all` adds completed background ones.
   *
   * Note what is NOT here: no `model` and no `agent` field (C-007). delphi records those
   * itself in `sessions.log` when it dispatches, and joins on `name`.
   */
  async agents(options: { all?: boolean; cwd?: string } = {}): Promise<ClaudeAgentEntry[]> {
    const args = ['agents', '--json']
    if (options.all) args.push('--all')
    if (options.cwd) args.push('--cwd', options.cwd)
    const output = await this.run(args)
    let parsed: unknown
    try {
      parsed = JSON.parse(output)
    } catch (error) {
      throw new ClaudeAdapterError('could not parse `claude agents --json` output', error)
    }
    if (!Array.isArray(parsed)) {
      throw new ClaudeAdapterError('`claude agents --json` did not return an array')
    }
    return parsed as ClaudeAgentEntry[]
  }

  /** Start a background session and return its short id. */
  async dispatch(options: DispatchOptions): Promise<{ id: string; output: string }> {
    const output = await this.run(buildDispatchArgs(options))
    const id = parseDispatchId(output)
    if (!id) {
      throw new ClaudeAdapterError(`could not find a session id in:\n${output}`)
    }
    return { id, output }
  }

  async stop(id: string): Promise<void> {
    await this.run(['stop', id])
  }

  async remove(id: string): Promise<void> {
    await this.run(['rm', id])
  }

  /**
   * Recent terminal output for a background session.
   *
   * This is raw ANSI — cursor moves, colours, status line and all (verified in Phase 0).
   * Use it to show a human what happened; never parse it for state. Seat progress comes
   * from the ledger the seat writes.
   */
  async logs(id: string): Promise<string> {
    return this.run(['logs', id])
  }
}
