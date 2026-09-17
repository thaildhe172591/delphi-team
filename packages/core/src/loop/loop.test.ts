import { describe, expect, it } from 'vitest'
import { type Board, BoardSchema } from '../schema/work.js'
import { advance, DEFAULT_LOOP_LIMITS, initialState, type LoopState, nextStep } from './plan.js'

const now = '2026-09-17T10:00:00+07:00'

function board(
  tasks: Array<
    Partial<{ id: string; status: string; owner: string; depends_on: string[]; blocked_reason: string }>
  >,
): Board {
  return BoardSchema.parse({
    version: 1,
    tasks: tasks.map((t, i) => ({
      id: t.id ?? `T-${i + 1}`,
      title: t.id ?? `T-${i + 1}`,
      status: t.status ?? 'ready',
      owner: t.owner ?? 'dev-be',
      depends_on: t.depends_on ?? [],
      updated: now,
      ...(t.blocked_reason ? { blocked_reason: t.blocked_reason } : {}),
    })),
  })
}

const state = (overrides: Partial<LoopState> = {}): LoopState => ({ ...initialState(), ...overrides })

describe('the loop stops', () => {
  it('when a seat reports BLOCKED', () => {
    // That is a seat asking for a person. Continuing past one is the failure that matters.
    const step = nextStep(board([{ id: 'T-1' }]), state({ lastReport: 'BLOCKED' }), DEFAULT_LOOP_LIMITS)
    expect(step.terminal).toBe(true)
    expect(step.outcome).toBe('stop-needs-human')
    expect(step.reason).toContain('asking for you')
  })

  it('when a seat asks for a decision, or raises a risk', () => {
    for (const report of ['DECISION', 'RISK'] as const) {
      const step = nextStep(board([{ id: 'T-1' }]), state({ lastReport: report }), DEFAULT_LOOP_LIMITS)
      expect(step.terminal, report).toBe(true)
      expect(step.outcome, report).toBe('stop-needs-human')
    }
  })

  it('after one story, because that is the default', () => {
    // Running this without thinking should do one story, not the whole backlog.
    expect(DEFAULT_LOOP_LIMITS.maxStories).toBe(1)
    const step = nextStep(board([{ id: 'T-2' }]), state({ completed: ['T-1'] }), DEFAULT_LOOP_LIMITS)
    expect(step.outcome).toBe('stop-budget')
    expect(step.terminal).toBe(true)
  })

  it('when a story has had too many goes', () => {
    const step = nextStep(
      board([{ id: 'T-1', status: 'review' }]),
      state({ current: 'T-1', attemptsOnCurrent: DEFAULT_LOOP_LIMITS.maxAttemptsPerStory }),
      DEFAULT_LOOP_LIMITS,
    )
    expect(step.outcome).toBe('story-exhausted')
    expect(step.terminal).toBe(true)
    expect(step.reason).toContain('handing it back')
  })

  it('when a story never moves, rather than handing it over again forever', () => {
    // The hole this closes: a seat that stops without touching the board leaves the story
    // exactly as it was, so the next decision is identical to the last one. Counting only
    // review rounds never incremented here, and the loop dispatched until someone noticed.
    let current = state()
    const stuck = board([{ id: 'T-1', status: 'doing' }])
    let dispatches = 0
    for (let i = 0; i < 20; i++) {
      const step = nextStep(stuck, { ...current, current: 'T-1' }, DEFAULT_LOOP_LIMITS)
      if (step.terminal) break
      dispatches++
      current = advance(current, step)
    }
    expect(dispatches).toBe(DEFAULT_LOOP_LIMITS.maxAttemptsPerStory)
  })

  it('when the board blocks the story underneath it', () => {
    const step = nextStep(
      board([{ id: 'T-1', status: 'blocked', blocked_reason: 'waiting on the API contract' }]),
      state({ current: 'T-1' }),
      DEFAULT_LOOP_LIMITS,
    )
    expect(step.outcome).toBe('stop-needs-human')
    expect(step.reason).toContain('waiting on the API contract')
  })

  it('when the story vanishes from the board', () => {
    const step = nextStep(board([]), state({ current: 'T-1' }), DEFAULT_LOOP_LIMITS)
    expect(step.outcome).toBe('stop-nothing-to-do')
    expect(step.terminal).toBe(true)
  })

  it('when nothing is ready to start', () => {
    const step = nextStep(board([{ id: 'T-1', status: 'backlog' }]), state(), DEFAULT_LOOP_LIMITS)
    expect(step.outcome).toBe('stop-nothing-to-do')
  })

  it('rather than adopting work someone else left half-done', () => {
    // A story sitting in review with no loop behind it is a person's unfinished business.
    // Picking it up would spend quota on a state the loop did not create.
    for (const status of ['doing', 'review'] as const) {
      expect(nextStep(board([{ id: 'T-1', status }]), state(), DEFAULT_LOOP_LIMITS).outcome, status).toBe(
        'stop-nothing-to-do',
      )
    }
  })

  it('when the only ready task is waiting on something unfinished', () => {
    const step = nextStep(
      board([
        { id: 'T-1', status: 'doing' },
        { id: 'T-2', status: 'ready', depends_on: ['T-1'] },
      ]),
      state(),
      DEFAULT_LOOP_LIMITS,
    )
    expect(step.outcome).toBe('stop-nothing-to-do')
  })
})

describe('the loop continues', () => {
  it('by giving a ready story to the seat that owns it', () => {
    const step = nextStep(board([{ id: 'T-1', owner: 'dev-fe' }]), state(), DEFAULT_LOOP_LIMITS)
    expect(step.outcome).toBe('dispatch-dev')
    expect(step.seat).toBe('dev-fe')
    expect(step.storyId).toBe('T-1')
    expect(step.terminal).toBe(false)
  })

  it('by sending a story in review to the reviewer', () => {
    const step = nextStep(
      board([{ id: 'T-1', status: 'review' }]),
      state({ current: 'T-1' }),
      DEFAULT_LOOP_LIMITS,
    )
    expect(step.outcome).toBe('dispatch-review')
    expect(step.seat).toBe('reviewer')
  })

  it('by counting a finished story and moving on', () => {
    const step = nextStep(
      board([{ id: 'T-1', status: 'done' }]),
      state({ current: 'T-1' }),
      DEFAULT_LOOP_LIMITS,
    )
    expect(step.outcome).toBe('story-done')
    expect(step.terminal).toBe(false)

    const after = advance(state({ current: 'T-1', attemptsOnCurrent: 1 }), step)
    expect(after.completed).toEqual(['T-1'])
    expect(after.current).toBeNull()
    expect(after.attemptsOnCurrent).toBe(0)
  })

  it('by picking up the next story once the budget allows it', () => {
    const limits = { maxStories: 2, maxAttemptsPerStory: 3 }
    const step = nextStep(
      board([
        { id: 'T-1', status: 'done' },
        { id: 'T-2', status: 'ready', depends_on: ['T-1'] },
      ]),
      state({ completed: ['T-1'] }),
      limits,
    )
    expect(step.outcome).toBe('dispatch-dev')
    expect(step.storyId).toBe('T-2')
  })

  it('never picks up a story it already finished in this run', () => {
    const limits = { maxStories: 5, maxAttemptsPerStory: 3 }
    const step = nextStep(board([{ id: 'T-1', status: 'ready' }]), state({ completed: ['T-1'] }), limits)
    expect(step.outcome).toBe('stop-nothing-to-do')
  })
})

describe('counting attempts', () => {
  it('counts every dispatch, because every dispatch costs the same', () => {
    let current = state({ current: 'T-1' })
    for (const outcome of ['dispatch-dev', 'dispatch-review'] as const) {
      current = advance(current, { outcome, storyId: 'T-1', reason: '', terminal: false })
    }
    expect(current.attemptsOnCurrent).toBe(2)
  })

  it('caps what one story can cost, however it moves', () => {
    // The real cycle: a dev pushes to review, the reviewer sends it back, repeat. Whichever
    // way the board goes, the run is bounded by the same number.
    let current = state({ current: 'T-1' })
    let status = 'review'
    let dispatches = 0
    for (let i = 0; i < 20; i++) {
      const step = nextStep(board([{ id: 'T-1', status }]), current, DEFAULT_LOOP_LIMITS)
      if (step.terminal) break
      dispatches++
      status = step.outcome === 'dispatch-review' ? 'doing' : 'review'
      current = advance(current, step)
    }
    expect(dispatches).toBe(DEFAULT_LOOP_LIMITS.maxAttemptsPerStory)
  })

  it('bounds the whole run, not just one story', () => {
    // The number that matters when you leave it running: stories x attempts, and no more.
    const limits = { maxStories: 3, maxAttemptsPerStory: 2 }
    const tasks = board([{ id: 'T-1' }, { id: 'T-2' }, { id: 'T-3' }, { id: 'T-4' }])
    let current = state()
    let dispatches = 0
    for (let i = 0; i < 50; i++) {
      const step = nextStep(tasks, current, limits)
      if (step.terminal) break
      if (step.outcome === 'dispatch-dev' || step.outcome === 'dispatch-review') dispatches++
      current = advance(current, step)
    }
    expect(dispatches).toBeLessThanOrEqual(limits.maxStories * limits.maxAttemptsPerStory)
  })
})
