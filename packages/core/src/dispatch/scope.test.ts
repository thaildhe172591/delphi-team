import { describe, expect, it } from 'vitest'
import { checkProjectContext, checkStories } from './department.js'

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

describe('the file every seat is told to read', () => {
  it('warns while it is still the template', () => {
    // Two seats on the first real run read this, found angle brackets, and worked from the
    // story alone. Nobody was told.
    const template = [
      '# Project context',
      '',
      '## What this project is',
      '<two or three lines>',
      '',
      '## How to run it',
      '<the command>',
    ].join('\n')

    const problems = checkProjectContext(template)
    expect(problems).toHaveLength(1)
    expect(problems[0]?.severity).toBe('warn')
    expect(problems[0]?.message).toContain('2 unfilled')
  })

  it('says nothing once it has been filled in', () => {
    const filled = ['# Project context', '', '## What this project is', 'A checkout service.'].join('\n')
    expect(checkProjectContext(filled)).toEqual([])
  })

  it('does not mistake prose that happens to contain a bracket', () => {
    expect(checkProjectContext('Run `node --test` and see <500ms per case.')).toEqual([])
  })
})
