import type { Board, BoardEntry } from '../schema/work.js'

/**
 * The automation loop: hand a story to a seat, let a reviewer see it, repeat.
 *
 * This is the most dangerous thing delphi does, so the design is mostly about stopping.
 * Every session it starts costs real quota, and a loop that cannot tell "this needs a
 * person" from "try again" will spend an afternoon rediscovering that.
 *
 * The rules, in order of how much trouble they prevent:
 *
 *   1. **It stops by default.** `--max-stories` defaults to one. Running it without
 *      thinking does one story, not the whole backlog.
 *   2. **Every dispatch on a story is counted, and there are three.** Dev, review, one more
 *      go. Counting only the reviews left a story stuck in `doing` being handed to the same
 *      seat forever, because nothing it did changed the number.
 *   3. **BLOCKED, DECISION and RISK end the loop, not the story.** Those are a seat saying
 *      it needs a human, and continuing past one is the failure mode that matters.
 *   4. **Nothing is dispatched that could not be dispatched by hand.** Same checks, same
 *      permission prompts, same refusals.
 */

export type LoopOutcome =
  | 'dispatch-dev'
  | 'dispatch-review'
  | 'story-done'
  | 'story-exhausted'
  | 'stop-needs-human'
  | 'stop-budget'
  | 'stop-nothing-to-do'

export interface LoopState {
  /** Stories finished in this run. */
  completed: string[]
  /** Dispatches already spent on the current story, of any kind. */
  attemptsOnCurrent: number
  /** The story being worked, if any. */
  current: string | null
  /** The most recent report outcome from a seat. */
  lastReport?: 'DONE' | 'BLOCKED' | 'DECISION' | 'RISK' | 'PROGRESS' | undefined
}

export interface LoopLimits {
  /** How many stories this run may finish. Deliberately one by default. */
  maxStories: number
  /**
   * How many times one story may be dispatched before the loop gives it back. Three is
   * dev, review, and one more go -- and it is a spend ceiling, not a quality judgement:
   * a seat that stops without touching the board would otherwise be handed the same
   * story until someone noticed the bill.
   */
  maxAttemptsPerStory: number
}

export const DEFAULT_LOOP_LIMITS: LoopLimits = { maxStories: 1, maxAttemptsPerStory: 3 }

export interface LoopStep {
  outcome: LoopOutcome
  /** The story this step concerns, when there is one. */
  storyId?: string
  /** The seat to dispatch, when the step is a dispatch. */
  seat?: string
  /** Said to the user, and written to the journal. */
  reason: string
  /** True when the loop should stop entirely. */
  terminal: boolean
}

/**
 * Decide the next step.
 *
 * Pure, and the whole point: the conditions under which this thing keeps spending money
 * are exactly the conditions written here, and they are tested.
 */
export function nextStep(board: Board, state: LoopState, limits: LoopLimits): LoopStep {
  // A seat asking for a human ends the run. Not the story — the run.
  if (state.lastReport === 'BLOCKED' || state.lastReport === 'DECISION' || state.lastReport === 'RISK') {
    return {
      outcome: 'stop-needs-human',
      ...(state.current ? { storyId: state.current } : {}),
      reason: `a seat reported ${state.lastReport}, which is it asking for you`,
      terminal: true,
    }
  }

  if (state.completed.length >= limits.maxStories) {
    return {
      outcome: 'stop-budget',
      reason: `${limits.maxStories} ${limits.maxStories === 1 ? 'story' : 'stories'} finished, which was the limit`,
      terminal: true,
    }
  }

  if (state.current) {
    const entry = board.tasks.find((task) => task.id === state.current)
    if (!entry) {
      return {
        outcome: 'stop-nothing-to-do',
        reason: `${state.current} is no longer on the board`,
        terminal: true,
      }
    }

    if (entry.status === 'done') {
      return { outcome: 'story-done', storyId: entry.id, reason: `${entry.id} is done`, terminal: false }
    }
    if (entry.status === 'blocked' || entry.status === 'cancelled') {
      return {
        outcome: 'stop-needs-human',
        storyId: entry.id,
        reason: `${entry.id} is ${entry.status}: ${entry.blocked_reason ?? 'no reason recorded'}`,
        terminal: true,
      }
    }

    if (state.attemptsOnCurrent >= limits.maxAttemptsPerStory) {
      // Whether it went round on review or never moved at all, the answer is the same.
      return {
        outcome: 'story-exhausted',
        storyId: entry.id,
        reason: `${entry.id} has had ${state.attemptsOnCurrent} goes and is still ${entry.status}; handing it back`,
        terminal: true,
      }
    }

    if (entry.status === 'review') {
      return {
        outcome: 'dispatch-review',
        storyId: entry.id,
        seat: 'reviewer',
        reason: `${entry.id} is waiting on review`,
        terminal: false,
      }
    }
    return {
      outcome: 'dispatch-dev',
      storyId: entry.id,
      seat: entry.owner,
      reason: `${entry.id} is ${entry.status}`,
      terminal: false,
    }
  }

  const next = pickNext(board, state.completed)
  if (!next) {
    return { outcome: 'stop-nothing-to-do', reason: 'nothing on the board is ready to start', terminal: true }
  }
  return {
    outcome: 'dispatch-dev',
    storyId: next.id,
    seat: next.owner,
    reason: `${next.id} is ready and its dependencies are met`,
    terminal: false,
  }
}

/** The next ready story whose dependencies are done, skipping what this run already did. */
function pickNext(board: Board, completed: string[]): BoardEntry | null {
  const done = new Set(board.tasks.filter((t) => t.status === 'done').map((t) => t.id))
  const seen = new Set(completed)
  return (
    board.tasks.find(
      (task) => task.status === 'ready' && !seen.has(task.id) && task.depends_on.every((id) => done.has(id)),
    ) ?? null
  )
}

/** Fold a step into the state, ready for the next decision. */
export function advance(state: LoopState, step: LoopStep): LoopState {
  switch (step.outcome) {
    case 'story-done':
      return {
        completed: [...state.completed, step.storyId as string],
        attemptsOnCurrent: 0,
        current: null,
      }
    case 'dispatch-review':
    case 'dispatch-dev':
      return { ...state, attemptsOnCurrent: state.attemptsOnCurrent + 1, current: step.storyId ?? null }
    default:
      return state
  }
}

export function initialState(): LoopState {
  return { completed: [], attemptsOnCurrent: 0, current: null }
}
