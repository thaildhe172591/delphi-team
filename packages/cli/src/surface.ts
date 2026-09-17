import {
  type Pane,
  planSurface,
  type ResolvedSurface,
  renderCommand,
  resolveSurface,
  resolveWindowsShim,
  type Surface,
  type SurfacePlan,
} from '@delphi-team/core'
import { execa } from 'execa'
import type { Context } from './context.js'
import type { Reporter } from './output.js'

/**
 * Putting the seats on screen, wherever they were started from.
 *
 * Every command that starts a session goes through here, because a seat you cannot see is
 * the same failure whichever command created it: it works, it finishes, and you find out
 * afterwards from the ledger. `dept up` had this inline and the others had nothing.
 *
 * Failing is never fatal. The seats are already working by the time this runs, and a
 * terminal that did not split is cosmetic — so a failure is reported and the command
 * carries on. The command is printed as well as run: something that rearranges your screen
 * should not be a surprise, and printing it is also what you paste when it does not work.
 */

export interface OpenedSurface {
  plan: SurfacePlan | null
  ran: boolean
  error: string | null
}

/** What `auto` should become on this machine, in this terminal. */
export function surfaceFor(requested: Surface): ResolvedSurface {
  return resolveSurface(requested, {
    platform: process.platform,
    inTmux: Boolean(process.env.TMUX),
    inVsCode: process.env.TERM_PROGRAM === 'vscode',
  })
}

/**
 * The executable a pane should launch, not the name of it.
 *
 * Windows Terminal starts the pane command itself and does not resolve PATHEXT, so a bare
 * `claude` — an npm `.cmd` shim on Windows — fails with "the system cannot find the file
 * specified" in a pane you then have to close by hand. Same root as C-017, one layer out.
 */
export function claudeBinary(): string {
  return process.env.DELPHI_CLAUDE_BIN ?? resolveWindowsShim('claude') ?? 'claude'
}

/** Open one pane per session, and say what happened. */
export async function openPanes(
  context: Context,
  requested: Surface,
  sessions: Array<{ title: string; id: string }>,
  options: { session?: string } = {},
): Promise<OpenedSurface> {
  const surface = surfaceFor(requested)
  if (surface === 'none' || sessions.length === 0) return { plan: null, ran: false, error: null }

  const panes: Pane[] = sessions.map((one) => ({
    title: one.title,
    command: claudeBinary(),
    args: ['attach', one.id],
    cwd: context.root,
  }))

  let plan: SurfacePlan
  try {
    plan = planSurface(surface, panes, options)
  } catch (error) {
    // A surface that cannot be planned here — `wt` asked for off Windows — is a note, not
    // a failure. The seats are running either way.
    return { plan: null, ran: false, error: message(error) }
  }
  if (plan.commands.length === 0) return { plan, ran: false, error: null }

  try {
    for (const command of plan.commands) {
      await execa(command.command, command.args, { cwd: context.root, input: '' })
    }
    return { plan, ran: true, error: null }
  } catch (error) {
    return { plan, ran: false, error: explain(message(error), surface) }
  }
}

/** A raw ENOENT says nothing useful about a terminal that is simply not installed. */
function explain(reason: string, surface: ResolvedSurface): string {
  if (!/ENOENT|not found|not recognized/i.test(reason)) return reason
  const tool = surface === 'wt' ? 'Windows Terminal (`wt`)' : `\`${surface}\``
  return `${reason}
  ${tool} is not on PATH. Set dispatch.surface to none in .delphi/config.yaml to stop trying.`
}

/** Print what was opened, or what to run when it could not be. */
export function reportSurface(report: Reporter, opened: OpenedSurface): void {
  if (!opened.plan) {
    if (opened.error) report.line(`\nCould not open the panes: ${opened.error}`)
    return
  }

  for (const note of opened.plan.notes) report.line(`\n${note}`)
  if (opened.plan.commands.length === 0) return

  report.line(`\n${opened.ran ? 'Split the terminal with:' : 'To split the terminal, run:'}`)
  for (const command of opened.plan.commands) report.line(`  ${renderCommand(command)}`)
  if (opened.error) report.line(`\n  that failed: ${opened.error}`)
}

function message(error: unknown): string {
  return error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error)
}
