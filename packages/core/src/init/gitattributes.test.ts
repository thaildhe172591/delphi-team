import { describe, expect, it } from 'vitest'
import { mergeGitattributes } from './gitattributes.js'

/**
 * delphi writes the ledger with LF everywhere so the same board reads the same on two
 * machines. Git on Windows defaults to checking it back out as CRLF, and then the next
 * appended line is LF, the file is mixed, and the whole thing reports as changed although
 * nobody edited it. One `.gitattributes` block settles it.
 */

describe('the delphi block in .gitattributes', () => {
  it('creates the file when a project has none', () => {
    const { content, change } = mergeGitattributes('')
    expect(change).toBe('added')
    expect(content).toContain('.delphi/** text eol=lf')
    expect(content).toContain('.claude/** text eol=lf')
  })

  it('keeps every rule the user already wrote', () => {
    const existing = '*.png binary\n*.md text\n'
    const { content, change } = mergeGitattributes(existing)
    expect(change).toBe('added')
    expect(content).toContain('*.png binary')
    expect(content).toContain('*.md text')
  })

  it('goes above the user rules, because git takes the last match', () => {
    // Someone who has written their own rule for these paths meant it. Appending ours
    // after theirs would silently override the choice they made.
    const { content } = mergeGitattributes('.delphi/** text eol=crlf\n')
    expect(content.indexOf('# delphi:start')).toBeLessThan(content.indexOf('eol=crlf'))
  })

  it('is idempotent', () => {
    const once = mergeGitattributes('*.png binary\n').content
    const twice = mergeGitattributes(once)
    expect(twice.change).toBe('unchanged')
    expect(twice.content).toBe(once)
  })

  it('refreshes its own block without touching anything around it', () => {
    const stale = ['# keep me', '# delphi:start', '.delphi/** text', '# delphi:end', '# and me'].join('\n')
    const { content, change } = mergeGitattributes(stale)
    expect(change).toBe('refreshed')
    expect(content).toContain('# keep me')
    expect(content).toContain('# and me')
    expect(content).toContain('.delphi/** text eol=lf')
  })
})
