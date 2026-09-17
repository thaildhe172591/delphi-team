import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  advance,
  appendJournal,
  appendLine,
  BoardSchema,
  ClaudeAdapter,
  DEFAULT_LOOP_LIMITS,
  initialState,
  isoNow,
  type LoopLimits,
  type LoopState,
  type LoopStep,
  nextStep,
  planDepartment,
  readTeam,
  readYaml,
} from '@delphi-team/core'
import { Command } from 'commander'
import { requireInitialised, resolveProject, UserError } from '../context.js'
import { createReporter, plural } from '../output.js'
import { promptFor, readStories, sessionName } from './dept.js'

/**
 * Run a story through dev and review without a person in the middle.
 *
 * This is the only command that spends quota on its own, so it is built to stop. The
 * decisions live in core as a tested state machine; what is here is the spending:
 *
 *   - **It does nothing without `--yes`.** Run it bare and it prints the ceiling, the
 *     first seat it would start and the prompt that seat would get, then exits.
 *   - **The ceiling is printed in sessions, not in stories.** `--max-stories` times
 *     `--max-attempts` is the most `claude` runs this command can ever start.
 *   - **A seat waiting on a permission prompt ends the run.** It is waiting for a person,
 *     and the loop is not one.
 *   - **Nothing is dispatched that `delphi dept up` would refuse.** Same story checks,
 *     same ownership conflicts, same prompt.
 */
export function loopCommand(): Command {
  return new Command('loop')
    .description('run a story through dev and review on its own — spends quota, so read --help')
    .option('--project <slug>')
    .option('--max-stories <n>', `stories this run may finish (default ${DEFAULT_LOOP_LIMITS.maxStories})`)
    .option(
      '--max-attempts <n>',
      `dispatches one story may cost (default ${DEFAULT_LOOP_LIMITS.maxAttemptsPerStory})`,
    )
    .option('--step-timeout <minutes>', 'give up on a seat that has not finished by then', '20')
    .option('--poll <seconds>', 'how often to ask whether the seat has finished', '15')
    .option('--team <name>', 'team template to use')
    .option('--yes', 'actually start seats; without it this prints what it would spend and stops')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const paths = context.paths.project(slug)

      const limits: LoopLimits = {
        maxStories: positive(options.maxStories, DEFAULT_LOOP_LIMITS.maxStories, '--max-stories'),
        maxAttemptsPerStory: positive(
          options.maxAttempts,
          DEFAULT_LOOP_LIMITS.maxAttemptsPerStory,
          '--max-attempts',
        ),
      }
      const ceiling = limits.maxStories * limits.maxAttemptsPerStory
      const stepTimeout = positive(options.stepTimeout, 20, '--step-timeout') * 60_000
      const pollEvery = positive(options.poll, 15, '--poll') * 1000
      const teamName = (options.team as string) ?? context.config.defaults.team
      const team = readTeam(teamName)

      let state = initialState()
      const board = await readYaml(paths.board, BoardSchema, { version: 1, tasks: [] })
      const first = nextStep(board, state, limits)

      // Without --yes this is the whole command: what it would cost, and what it would do
      // first. Spending quota should take a second command, typed on purpose.
      if (!options.yes) {
        const preview = first.storyId
          ? promptFor(
              slug,
              teamName,
              first.seat ?? 'unknown',
              first.storyId,
              await readStories(context, slug, [first.storyId]),
            )
          : null

        report.emit({ dryRun: true, limits, ceiling, first, prompt: preview }, () => {
          report.line(`Loop on ${slug}, at most ${plural(ceiling, 'session')}:`)
          report.line(`  ${plural(limits.maxStories, 'story')} × ${limits.maxAttemptsPerStory} attempts`)
          report.line(`\nFirst step: ${first.outcome} — ${first.reason}`)
          if (first.terminal) {
            report.line('\nThere is nothing for it to do, so --yes would spend nothing.')
            return
          }
          report.line(`\nIt would start @${first.seat} with:\n`)
          report.line(preview ?? '')
          report.line('\nRun it for real with --yes. It will keep going until one of:')
          report.line(`  · ${plural(limits.maxStories, 'story')} finished`)
          report.line(`  · a story has cost ${limits.maxAttemptsPerStory} attempts`)
          report.line('  · a seat reports BLOCKED, DECISION or RISK, or waits on a permission prompt')
          report.line(`  · a seat has not finished ${stepTimeout / 60_000} minutes after it started`)
        })
        return
      }

      const adapter = new ClaudeAdapter({ cwd: context.root })
      await appendJournal(paths.journal, {
        id: '-',
        seat: 'orchestrator',
        event: 'loop start',
        detail: `up to ${ceiling} sessions (${limits.maxStories} × ${limits.maxAttemptsPerStory})`,
      })

      const history: Array<{ step: LoopStep; session?: string; outcome?: string }> = []
      let stop: LoopStep | null = null

      // Bounded twice: the state machine stops on its own, and this cannot outlive the
      // ceiling even if a future edit breaks that. It is the money path.
      for (let round = 0; round <= ceiling + limits.maxStories; round++) {
        const current = await readYaml(paths.board, BoardSchema, { version: 1, tasks: [] })
        const step = nextStep(current, state, limits)

        if (step.terminal) {
          stop = step
          break
        }
        if (step.outcome === 'story-done') {
          history.push({ step })
          report.line(`✓ ${step.storyId} is done.`)
          state = advance(state, step)
          continue
        }

        const id = step.storyId as string
        const seat = step.seat as string
        const stories = await readStories(context, slug, [id])
        const story = stories[id]

        if (story?.invalid) {
          stop = {
            outcome: 'stop-needs-human',
            storyId: id,
            reason: `${id} frontmatter does not parse: ${story.invalid}`,
            terminal: true,
          }
          break
        }

        // The same refusals `dept up` makes. A loop that dispatches what a person would be
        // stopped from dispatching is worse than no loop.
        const blocks = planDepartment({ team, config: context.config, board: current, stories })
          .problems.filter((problem) => problem.severity === 'block')
          .map((problem) => `${problem.message}${problem.fix ? ` — ${problem.fix}` : ''}`)

        if (blocks.length > 0) {
          stop = {
            outcome: 'stop-needs-human',
            storyId: id,
            reason: `cannot dispatch ${id}: ${blocks.join('; ')}`,
            terminal: true,
          }
          break
        }

        const models = context.config.models[seat]
        const name = sessionName(slug, seat, context.config.project_prefix_len)
        report.line(`→ ${step.reason}; starting @${seat}…`)

        const { id: session } = await adapter.dispatch({
          prompt: promptFor(slug, teamName, seat, id, stories),
          agent: seat,
          name,
          ...(models?.model ? { model: models.model } : {}),
          ...(models?.effort ? { effort: models.effort } : {}),
        })
        await appendLine(
          paths.sessions,
          [isoNow(), seat, 'loop', session, name, models?.model ?? '-', models?.effort ?? '-', id].join(
            ' | ',
          ),
        )
        await appendJournal(paths.journal, {
          id,
          seat: 'orchestrator',
          event: `loop dispatched ${seat}`,
          detail: session,
        })

        // Recorded before the wait, not after: a run that stops because the seat is stuck
        // still started that session, and saying otherwise hides what it spent.
        const record: { step: LoopStep; session?: string; outcome?: string } = { step, session }
        history.push(record)

        const ended = await waitFor(adapter, session, stepTimeout, pollEvery)
        if (ended !== 'finished') {
          stop = {
            outcome: 'stop-needs-human',
            storyId: id,
            reason:
              ended === 'waiting'
                ? `@${seat} is waiting for you: claude attach ${session}`
                : ended === 'timeout'
                  ? `@${seat} was still working after ${stepTimeout / 60_000} minutes; it is still running as ${session}`
                  : `@${seat} ended as ${ended}; see claude logs ${session}`,
            terminal: true,
          }
          break
        }

        // The report is written by the seat, so a stale one from an earlier run is
        // possible. Every outcome it can carry either stops the loop or does nothing, so
        // reading an old one can only make this stop sooner.
        const reported = await lastOutcome(paths.reportsFor(seat), id)
        if (reported) record.outcome = reported
        state = { ...advance(state, step), lastReport: reported }
      }

      const ending = stop ?? {
        outcome: 'stop-budget' as const,
        reason: `stopped at the hard ceiling of ${plural(ceiling, 'session')}`,
        terminal: true,
      }

      await appendJournal(paths.journal, {
        id: ending.storyId ?? '-',
        seat: 'orchestrator',
        event: `loop stopped: ${ending.outcome}`,
        detail: ending.reason,
      })

      report.emit({ ok: true, limits, history, completed: state.completed, stop: ending }, () => {
        report.line(`\nStopped: ${ending.reason}`)
        if (state.completed.length > 0) report.line(`Finished: ${state.completed.join(', ')}`)
        report.line(`Started ${plural(history.filter((h) => h.session).length, 'session')}.`)
        if (ending.outcome === 'stop-needs-human') {
          report.line('\nThis one is yours. The loop will not try it again.')
        }
      })
    })
}

/** Wait for a dispatched session to stop, or for a reason to stop waiting. */
async function waitFor(
  adapter: ClaudeAdapter,
  session: string,
  timeout: number,
  pollEvery: number,
): Promise<'finished' | 'waiting' | 'timeout' | 'failed' | 'stopped'> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollEvery))
    const entry = (await adapter.agents({ all: true })).find((agent) => agent.id === session)

    // A session that has aged out of the list is one that finished.
    if (!entry) return 'finished'
    // This is how a seat stuck on a permission prompt announces itself, and it is asking
    // a person, not the loop.
    if (entry.waitingFor) return 'waiting'
    if (entry.state === 'done') return 'finished'
    if (entry.state === 'failed') return 'failed'
    if (entry.state === 'stopped') return 'stopped'
  }
  return 'timeout'
}

/** The Outcome line from the seat's most recent report on this task. */
async function lastOutcome(dir: string, taskId: string): Promise<LoopState['lastReport']> {
  const number = (file: string) => Number(/-(\d+)\.md$/.exec(file)?.[1] ?? 0)
  const files = (await readdir(dir).catch(() => []))
    .filter((file) => file.startsWith(`${taskId}-`))
    .sort((a, b) => number(a) - number(b))

  const latest = files.at(-1)
  if (!latest) return undefined

  const text = await readFile(join(dir, latest), 'utf8').catch(() => '')
  const word = /##\s*Outcome\s*\r?\n+\s*(\w+)/i.exec(text)?.[1]?.toUpperCase()
  const known = ['DONE', 'BLOCKED', 'DECISION', 'RISK', 'PROGRESS'] as const
  return known.find((outcome) => outcome === word)
}

function positive(value: unknown, fallback: number, flag: string): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new UserError(`${flag} needs a whole number of at least 1, not "${String(value)}"`)
  }
  return parsed
}
