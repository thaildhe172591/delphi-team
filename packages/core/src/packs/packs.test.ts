import { describe, expect, it } from 'vitest'
import { mergeConfigInto } from './apply.js'

/**
 * A pack edits the user's config, so the two things that matter are that it says what it
 * changed and that it leaves everything else — including the comments, which are most of
 * the file and all of the reasoning — exactly as it found them.
 */

const config = `version: 1

# The language seats answer you in.
language: en

dispatch:
  # Three to five seats working at once coordinate well. More do not.
  max_active: 5
  hard_limit: 8

models:
  orchestrator: { model: fable, effort: high } # xhigh when planning something large
  dev-be: { model: opus, effort: xhigh }
`

describe('merging a pack into a config', () => {
  it('keeps the comments, which are the part that explains the numbers', () => {
    const { content } = mergeConfigInto(config, { dispatch: { max_active: 2 } })
    expect(content).toContain('# Three to five seats working at once coordinate well.')
    expect(content).toContain('# The language seats answer you in.')
    expect(content).toContain('# xhigh when planning something large')
  })

  it('changes only what the pack names, leaving the rest of the block alone', () => {
    const { content } = mergeConfigInto(config, { dispatch: { max_active: 2 } })
    expect(content).toContain('max_active: 2')
    expect(content).toContain('hard_limit: 8')
    expect(content).toContain('language: en')
  })

  it('reports every change as a path, an old value and a new one', () => {
    const { changes } = mergeConfigInto(config, {
      dispatch: { max_active: 2 },
      models: { orchestrator: { model: 'sonnet' } },
    })
    expect(changes).toEqual([
      { path: 'dispatch.max_active', from: '5', to: '2' },
      { path: 'models.orchestrator.model', from: 'fable', to: 'sonnet' },
    ])
  })

  it('says a value is not set rather than pretending it was something', () => {
    const { changes } = mergeConfigInto(config, { budget: { warn_parallel_sessions: 2 } })
    expect(changes).toEqual([{ path: 'budget.warn_parallel_sessions', from: '(not set)', to: '2' }])
  })

  it('changes nothing, and touches nothing, when the config already matches', () => {
    const { content, changes } = mergeConfigInto(config, { dispatch: { max_active: 5 } })
    expect(changes).toEqual([])
    // Byte-identical: applying a pack twice must not produce a diff the second time.
    expect(content).toBe(config)
  })

  it('writes a whole list rather than merging into it', () => {
    // `owns` is a claim about which files a seat may touch. Half-replacing one would be
    // the worst possible outcome.
    const { content, changes } = mergeConfigInto(config, {
      seats: { 'dev-be': { owns: ['src/api/**', 'db/**'] } },
    })
    expect(changes[0]?.path).toBe('seats.dev-be.owns')
    expect(content).toContain('src/api/**')
    expect(content).toContain('db/**')
  })
})
