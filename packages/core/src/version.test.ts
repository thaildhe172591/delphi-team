import { describe, expect, it } from 'vitest'
import { compareVersions, MIN_CLAUDE_VERSION, parseClaudeVersion, satisfiesMinimum } from './version.js'

describe('parseClaudeVersion', () => {
  it('reads the real `claude --version` output', () => {
    expect(parseClaudeVersion('2.1.274 (Claude Code)')).toBe('2.1.274')
  })

  it('returns null when there is no version to find', () => {
    expect(parseClaudeVersion('command not found')).toBeNull()
    expect(parseClaudeVersion('')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('compares segments numerically, not lexically', () => {
    // The whole reason this function exists: '2.1.9' > '2.1.274' under a string compare.
    expect(compareVersions('2.1.274', '2.1.9')).toBe(1)
    expect(compareVersions('2.1.9', '2.1.274')).toBe(-1)
  })

  it('treats missing segments as zero', () => {
    expect(compareVersions('2.1', '2.1.0')).toBe(0)
    expect(compareVersions('2.1.1', '2.1')).toBe(1)
  })

  it('treats non-numeric segments as zero rather than throwing', () => {
    expect(compareVersions('2.1.x', '2.1.0')).toBe(0)
  })

  it('is reflexive', () => {
    expect(compareVersions(MIN_CLAUDE_VERSION, MIN_CLAUDE_VERSION)).toBe(0)
  })
})

describe('satisfiesMinimum', () => {
  it('accepts the verified version and anything newer', () => {
    expect(satisfiesMinimum('2.1.274')).toBe(true)
    expect(satisfiesMinimum('2.2.0')).toBe(true)
    expect(satisfiesMinimum('3.0.0')).toBe(true)
  })

  it('rejects anything older', () => {
    expect(satisfiesMinimum('2.1.273')).toBe(false)
    expect(satisfiesMinimum('1.9.99')).toBe(false)
  })
})
