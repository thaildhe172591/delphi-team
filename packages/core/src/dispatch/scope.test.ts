import { describe, expect, it } from 'vitest'
import { checkStories } from './department.js'

/**
 * The collision check, pulled out of `planDepartment` because only `dept up` was running it.
 *
 * On 2026-09-17 two stories were written that both claimed `src/public/index.html`, and both
 * were started with `delphi dispatch`, which ran no pre-flight at all. dev-be later deleted
 * the file while chasing a test fixture; it was dev-fe's work, untracked, and unrecoverable.
 * `dept up` would have refused the second dispatch outright. That is the case below.
 */

const story = (files: string[]) => ({ files, acceptance: ['it works'], verify: 'npm test' })

describe('two stories claiming one file', () => {
  it('blocks, and names both stories and the file', () => {
    const problems = checkStories({
      'T-002': story(['src/server.js', 'src/public/index.html']),
      'T-003': story(['src/public/index.html']),
    })

    const collision = problems.find((problem) => problem.message.includes('both claim'))
    expect(collision?.severity).toBe('block')
    expect(collision?.message).toContain('T-002')
    expect(collision?.message).toContain('T-003')
    expect(collision?.message).toContain('src/public/index.html')
  })

  it('says nothing when the work does not overlap', () => {
    const problems = checkStories({
      'T-002': story(['src/server.js']),
      'T-003': story(['src/public/index.html']),
    })
    expect(problems).toEqual([])
  })
})

describe('what a seat needs to do the job at all', () => {
  it('blocks a story that never says when it is finished', () => {
    const problems = checkStories({ 'T-001': { files: ['src/a.ts'], verify: 'npm test' } })
    expect(problems.find((p) => p.message.includes('acceptance'))?.severity).toBe('block')
  })

  it('blocks a story that does not say which files it owns', () => {
    // Without this there is nothing for the collision check above to compare.
    const problems = checkStories({ 'T-001': { acceptance: ['it works'], verify: 'npm test' } })
    expect(problems.find((p) => p.message.includes('which files'))?.severity).toBe('block')
  })

  it('only warns about a missing verify command', () => {
    // A seat can still work; it just has nothing to paste as evidence.
    const problems = checkStories({ 'T-001': { files: ['src/a.ts'], acceptance: ['it works'] } })
    expect(problems).toHaveLength(1)
    expect(problems[0]?.severity).toBe('warn')
  })
})
