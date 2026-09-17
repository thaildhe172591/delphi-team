import { readFile } from 'node:fs/promises'
import {
  BoardSchema,
  ClaudeAdapter,
  type ClaudeAgentEntry,
  LedgerPaths,
  openTasks,
  ProjectIndexSchema,
  readYaml,
} from '@delphi-team/core'
import * as vscode from 'vscode'

/**
 * The VS Code companion: a window onto a department that the CLI is running.
 *
 * It starts nothing and changes nothing. `delphi dept up` creates the seats; this opens a
 * terminal onto each one, keeps the board in the status bar, and says something when the
 * department changes. That division is deliberate — dispatching costs quota and belongs in
 * the command you typed, not in an editor that reacted to a file being saved.
 *
 * There is no channel from the CLI to VS Code here, and none is needed: the ledger is the
 * channel. `sessions.log` is written by whoever started the seats, and this watches it.
 */

let status: vscode.StatusBarItem | undefined

export function activate(context: vscode.ExtensionContext): void {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!root) return

  const paths = new LedgerPaths(root)

  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  status.command = 'delphi.showBoard'
  context.subscriptions.push(status)

  context.subscriptions.push(
    vscode.commands.registerCommand('delphi.openDepartment', () => openDepartment(paths, root)),
    vscode.commands.registerCommand('delphi.showBoard', () => showBoard(root)),
  )

  // One watcher over the ledger: the board drives the status bar, and a new line in
  // sessions.log means someone started seats that are not on screen yet.
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(root, '.delphi/projects/*/{board.yaml,sessions.log}'),
  )
  context.subscriptions.push(watcher)

  const refresh = (uri: vscode.Uri) => {
    void showStatus(paths)
    if (uri.path.endsWith('sessions.log')) void offerToOpen(paths, root)
  }
  watcher.onDidChange(refresh, null, context.subscriptions)
  watcher.onDidCreate(refresh, null, context.subscriptions)

  void showStatus(paths)
}

export function deactivate(): void {
  status?.dispose()
}

/** The slug of the open project, which is the one the status bar and commands mean. */
async function openProject(paths: LedgerPaths): Promise<string | undefined> {
  const index = await readYaml(paths.index, ProjectIndexSchema, { version: 1, projects: [] })
  return index.projects.find((project) => project.status === 'open')?.slug
}

async function showStatus(paths: LedgerPaths): Promise<void> {
  if (!status) return
  const slug = await openProject(paths)
  if (!slug) {
    status.hide()
    return
  }

  const board = await readYaml(paths.project(slug).board, BoardSchema, { version: 1, tasks: [] })
  const open = openTasks(board).length
  const blocked = board.tasks.filter((task) => task.status === 'blocked').length

  status.text = `$(organization) ${slug}: ${open} open${blocked > 0 ? ` · ${blocked} blocked` : ''}`
  status.tooltip = blocked > 0 ? 'Something is blocked and nobody can act on it' : 'The delphi board'
  // Blocked work is the thing worth interrupting someone for; open work is not.
  status.backgroundColor = blocked > 0 ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined
  status.show()
}

interface Seat {
  seat: string
  session: string
  name: string
  task: string
}

/** The last session delphi recorded per seat, newest line winning. */
async function recordedSeats(paths: LedgerPaths, slug: string): Promise<Seat[]> {
  let log = ''
  try {
    log = await readFile(paths.project(slug).sessions, 'utf8')
  } catch {
    return []
  }

  const seats = new Map<string, Seat>()
  for (const line of log.split('\n').filter(Boolean)) {
    const [, seat, , session, name, , , task] = line.split(' | ').map((part) => part.trim())
    if (!seat || !session) continue
    seats.set(seat, { seat, session, name: name ?? seat, task: task ?? '-' })
  }
  return [...seats.values()]
}

/**
 * Open one editor terminal per seat that is actually running.
 *
 * Joined against `claude agents --json` rather than trusting the log, because a log line
 * is a record that a session was started, not evidence that it still exists. Attaching to
 * a session that ended puts an error in a pane and teaches the user to ignore panes.
 */
async function openDepartment(paths: LedgerPaths, root: string): Promise<void> {
  const slug = await openProject(paths)
  if (!slug) {
    void vscode.window.showInformationMessage('No delphi project is open.')
    return
  }

  const recorded = await recordedSeats(paths, slug)
  if (recorded.length === 0) {
    void vscode.window.showInformationMessage(
      'delphi has not started any seats here. Run `delphi dept up` first.',
    )
    return
  }

  let live: ClaudeAgentEntry[] | null = null
  try {
    live = await new ClaudeAdapter({ cwd: root, binary: claudePath() }).agents({ all: false })
  } catch {
    // Not being able to ask is not the same as nothing running. Say so, and open what the
    // ledger recorded rather than refusing to do anything.
    void vscode.window.showWarningMessage(
      'Could not ask Claude Code what is running; opening what delphi recorded.',
    )
  }

  const running = live
    ? new Set(live.filter((agent) => agent.kind === 'background' && agent.id).map((agent) => agent.id))
    : null
  const seats = running ? recorded.filter((seat) => running.has(seat.session)) : recorded

  if (seats.length === 0) {
    void vscode.window.showInformationMessage(
      `Nothing ${slug} started is still running. \`delphi dept up\` starts the department again.`,
    )
    return
  }

  seats.forEach((seat, index) => {
    const terminal = vscode.window.createTerminal({
      name: `${seat.seat} · ${seat.task}`,
      cwd: root,
      iconPath: new vscode.ThemeIcon('person'),
      // In the editor area, one column each: the layout the department is meant to have.
      location: { viewColumn: index === 0 ? vscode.ViewColumn.One : vscode.ViewColumn.Beside },
      // The session is the terminal's own process rather than a line typed into a shell.
      // A path with a space in it would otherwise need quoting that differs per shell, and
      // this way the pane closes when the seat does.
      shellPath: claudePath(),
      shellArgs: ['attach', seat.session],
    })
    if (index === 0) terminal.show(false)
  })
}

function showBoard(root: string): void {
  const delphi = vscode.workspace.getConfiguration('delphi').get<string>('delphiPath') ?? 'delphi'
  const terminal = vscode.window.createTerminal({
    name: 'delphi board',
    cwd: root,
    iconPath: new vscode.ThemeIcon('checklist'),
    location: { viewColumn: vscode.ViewColumn.Beside },
    shellPath: delphi,
    shellArgs: ['watch', '--follow'],
  })
  terminal.show(false)
}

/** Say once that seats have started, rather than opening panes nobody asked for. */
let announced = 0
async function offerToOpen(paths: LedgerPaths, root: string): Promise<void> {
  if (!vscode.workspace.getConfiguration('delphi').get<boolean>('notifyOnDispatch', true)) return

  const slug = await openProject(paths)
  if (!slug) return

  const seats = await recordedSeats(paths, slug)
  if (seats.length === 0 || seats.length === announced) return
  announced = seats.length

  const answer = await vscode.window.showInformationMessage(
    `delphi is running ${seats.length} seat${seats.length === 1 ? '' : 's'} on ${slug}.`,
    'Open them',
    'Not now',
  )
  if (answer === 'Open them') await openDepartment(paths, root)
}

function claudePath(): string {
  return vscode.workspace.getConfiguration('delphi').get<string>('claudePath') ?? 'claude'
}
