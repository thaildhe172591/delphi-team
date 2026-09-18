import { createInterface } from 'node:readline/promises'
import type { Context } from './context.js'
import type { Reporter } from './output.js'

/**
 * Asking before spending quota, which `dispatch.confirm_before_dispatch` promised and
 * nothing delivered: the field was declared, defaulted to true, and never read.
 *
 * The hard part is not the question, it is where it is asked from. The orchestrator runs
 * `dept up` through its Bash tool, with no terminal on the other end — a prompt there would
 * hang the department until it timed out. So a session that cannot be asked is not asked;
 * it proceeds and says that it did, which is honest and leaves the record in the journal
 * either way.
 */

export interface Confirmation {
  /** Did a person actually see the question? */
  asked: boolean
  approved: boolean
  /** Why it went the way it did, for the output and the journal. */
  reason: string
}

export async function confirmDispatch(
  context: Context,
  summary: string,
  options: { yes?: boolean | undefined },
): Promise<Confirmation> {
  if (options.yes) return { asked: false, approved: true, reason: '--yes' }
  if (!context.config.dispatch.confirm_before_dispatch) {
    return { asked: false, approved: true, reason: 'confirm_before_dispatch is off' }
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    // Not a refusal to ask — there is nobody to ask. Saying so is the point: it is the
    // difference between "you approved this" and "nothing could be asked".
    return { asked: false, approved: true, reason: 'not a terminal, so nothing could be asked' }
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await rl.question(`${summary}\nStart them? [y/N] `)).trim().toLowerCase()
    const approved = answer === 'y' || answer === 'yes'
    return { asked: true, approved, reason: approved ? 'you said yes' : 'you said no' }
  } finally {
    rl.close()
  }
}

/** Say how the decision was reached, when it was not a person saying yes. */
export function reportConfirmation(report: Reporter, confirmation: Confirmation): void {
  if (confirmation.asked) return
  if (confirmation.reason === '--yes') return
  report.line(`Starting without asking: ${confirmation.reason}.`)
}
