import { Command } from 'commander'
import {
  costCommand,
  exportCommand,
  importCommand,
  meetingCommand,
  memoryCommand,
  upgradeCommand,
  worktreeCommand,
} from './commands/advanced.js'
import { deptCommand, handoffCommand, inboxCommand, nextCommand, shiftCommand } from './commands/dept.js'
import { doctorCommand } from './commands/doctor.js'
import { hookCommand } from './commands/hook.js'
import { initCommand } from './commands/init.js'
import {
  checkpointCommand,
  journalCommand,
  projectCommand,
  reportCommand,
  resumeCommand,
  stateCommand,
  storyCommand,
  taskCommand,
} from './commands/ledger.js'
import { capabilityCommand, roleCommand, teamCommand } from './commands/roles.js'
import { dispatchCommand, seatCommand, snapCommand, startCommand } from './commands/session.js'
import { watchCommand } from './commands/watch.js'
import { UserError } from './context.js'
import { EXIT } from './output.js'

/**
 * Build the command tree.
 *
 * Kept separate from the process entry point so tests can run it without spawning node,
 * and so the npm and PyPI distributions provably produce the same output.
 */
export function createProgram(version: string = __DELPHI_VERSION__): Command {
  const program = new Command()
    .name('delphi')
    .description('Run Claude Code as a department. Unofficial; works with Claude Code.')
    .version(version, '-v, --version')
    .showHelpAfterError()

  program.addCommand(initCommand())
  program.addCommand(doctorCommand())

  program.addCommand(roleCommand())
  program.addCommand(capabilityCommand())
  program.addCommand(teamCommand())

  program.addCommand(projectCommand())
  program.addCommand(resumeCommand())
  program.addCommand(stateCommand())
  program.addCommand(journalCommand())
  program.addCommand(checkpointCommand())

  program.addCommand(storyCommand())
  program.addCommand(taskCommand())
  program.addCommand(reportCommand())

  program.addCommand(deptCommand())
  program.addCommand(shiftCommand())
  program.addCommand(handoffCommand())
  program.addCommand(inboxCommand())
  program.addCommand(nextCommand())

  program.addCommand(seatCommand())
  program.addCommand(startCommand())
  program.addCommand(dispatchCommand())
  program.addCommand(snapCommand())
  program.addCommand(watchCommand())

  program.addCommand(upgradeCommand())
  program.addCommand(memoryCommand())
  program.addCommand(worktreeCommand())
  program.addCommand(exportCommand())
  program.addCommand(meetingCommand())
  program.addCommand(costCommand())
  program.addCommand(importCommand())

  program.addCommand(hookCommand(), { hidden: true })

  return program
}

/**
 * Run the CLI, turning an expected failure into a clear message rather than a stack trace.
 *
 * A stack trace tells the user that the tool broke. A message with a hint tells them what
 * to do, and most failures here are the second kind.
 */
export async function run(argv: string[] = process.argv): Promise<void> {
  try {
    await createProgram().parseAsync(argv)
  } catch (error) {
    if (error instanceof UserError) {
      process.stderr.write(`error: ${error.message}\n`)
      if (error.hint) process.stderr.write(`${error.hint}\n`)
      process.exitCode = EXIT.userError
      return
    }
    if (isCommanderExit(error)) {
      process.exitCode = (error as { exitCode?: number }).exitCode ?? EXIT.userError
      return
    }
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = EXIT.invalidState
  }
}

function isCommanderExit(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String(error.code).startsWith('commander.')
  )
}
