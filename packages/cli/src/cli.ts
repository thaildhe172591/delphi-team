import { Command } from 'commander'

/**
 * Build the command tree. Kept separate from the process entry point so tests can
 * run it without spawning node, and so npm and PyPI provably produce the same output.
 */
export function createProgram(version: string = __DELPHI_VERSION__): Command {
  return new Command()
    .name('delphi')
    .description('Run Claude Code as a department. Unofficial; works with Claude Code.')
    .version(version, '-v, --version')
    .showHelpAfterError()
}
