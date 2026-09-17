import type { Surface } from '../schema/common.js'

/**
 * Splitting a terminal so the seats can be watched side by side.
 *
 * Building the command is separate from running it, because the syntax differs per
 * terminal and because a command that opens windows on someone's screen should be
 * printable before it is run. `--dry-run` shows exactly what would be executed.
 *
 * What is settled and what is not:
 *   - Agent Teams draws its own panes, and needs tmux or iTerm2 to do it. That is not this.
 *   - This is for `sessions` mode: one pane per seat, each attached to a background session.
 *   - `wt -w 0 split-pane` was confirmed on 2026-09-17: the pane opens in the current
 *     window, which is what `-w 0` buys. The command is still printed when it runs,
 *     because a command that rearranges your screen should not be a surprise.
 */

export interface Pane {
  /** Shown as the pane title. */
  title: string
  /** Executable and arguments, already split — nothing here goes through a shell. */
  command: string
  args: string[]
  /** Working directory for the pane. */
  cwd: string
}

export interface SurfaceCommand {
  command: string
  args: string[]
  /** What this step does, for the dry run. */
  describe: string
}

export class SurfaceError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message)
    this.name = 'SurfaceError'
  }
}

/**
 * Windows Terminal: one `wt` invocation, with the panes chained by a bare `;` argument.
 *
 * `-w 0` targets the current window rather than opening another one, which is what makes
 * this feel like splitting rather than launching.
 */
export function windowsTerminalCommand(panes: Pane[]): SurfaceCommand[] {
  if (panes.length === 0) return []

  const args: string[] = ['-w', '0']
  panes.forEach((pane, index) => {
    if (index > 0) args.push(';')
    args.push('split-pane', '--title', pane.title, '-d', pane.cwd, pane.command, ...pane.args)
  })

  return [
    {
      command: 'wt',
      args,
      describe: `split the current Windows Terminal window into ${panes.length} panes`,
    },
  ]
}

/**
 * tmux: create the session detached, add a pane per extra seat, then tile it.
 *
 * Several commands rather than one, because tmux has no way to express "and also" in a
 * single invocation without going through a shell, and a shell is exactly what we avoid.
 */
export function tmuxCommands(session: string, panes: Pane[]): SurfaceCommand[] {
  if (panes.length === 0) return []
  const first = panes[0] as Pane

  const commands: SurfaceCommand[] = [
    {
      command: 'tmux',
      args: ['new-session', '-d', '-s', session, '-c', first.cwd, first.command, ...first.args],
      describe: `start tmux session ${session} with ${first.title}`,
    },
  ]

  for (const pane of panes.slice(1)) {
    commands.push({
      command: 'tmux',
      args: ['split-window', '-t', session, '-c', pane.cwd, pane.command, ...pane.args],
      describe: `add a pane for ${pane.title}`,
    })
  }

  commands.push({
    command: 'tmux',
    args: ['select-layout', '-t', session, 'tiled'],
    describe: 'tile the panes',
  })
  commands.push({
    command: 'tmux',
    args: ['attach-session', '-t', session],
    describe: 'attach to the session',
  })
  return commands
}

export interface SurfacePlan {
  surface: Surface
  commands: SurfaceCommand[]
  /** Things the user should know before this runs. */
  notes: string[]
}

/** Work out how to show these panes on the chosen surface. */
export function planSurface(
  surface: Surface,
  panes: Pane[],
  options: { session?: string } = {},
): SurfacePlan {
  const notes: string[] = []

  switch (surface) {
    case 'wt':
      if (process.platform !== 'win32') {
        throw new SurfaceError('Windows Terminal is only available on Windows', 'try --surface tmux')
      }
      notes.push('panes open in the current Windows Terminal window')
      return { surface, commands: windowsTerminalCommand(panes), notes }

    case 'tmux':
      notes.push('a tmux session is created and attached; detach with Ctrl+B then D')
      return { surface, commands: tmuxCommands(options.session ?? 'delphi', panes), notes }

    case 'desktop':
      // There is no way to drive Claude Desktop from a command, and simulating clicks is
      // explicitly out of scope, so this surface is instructions rather than automation.
      notes.push('Claude Desktop cannot be split from a command; open the sessions yourself')
      return { surface, commands: [], notes }

    case 'vscode':
      notes.push('the VS Code surface arrives with the companion extension')
      return { surface, commands: [], notes }

    default:
      return { surface: 'none', commands: [], notes }
  }
}

/** The exact line that would run, for a dry run. Quoted only where it has to be. */
export function renderCommand(command: SurfaceCommand): string {
  return [command.command, ...command.args].map(quote).join(' ')
}

function quote(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value
}
