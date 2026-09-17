import { describe, expect, it } from 'vitest'
import { MIN_CLAUDE_VERSION, satisfiesMinimum } from '../version.js'
import { buildDispatchArgs, ClaudeAdapter, ClaudeAdapterError, parseDispatchId } from './claude.js'

describe('buildDispatchArgs', () => {
  it('builds the full dispatch shape', () => {
    expect(
      buildDispatchArgs({
        prompt: 'do the thing',
        agent: 'dev-be',
        model: 'claude-opus-4-8',
        effort: 'xhigh',
        name: 'ocr-dev-be',
      }),
    ).toEqual([
      '--bg',
      '--agent',
      'dev-be',
      '--model',
      'claude-opus-4-8',
      '--effort',
      'xhigh',
      '--name',
      'ocr-dev-be',
      'do the thing',
    ])
  })

  it('omits what was not asked for', () => {
    expect(buildDispatchArgs({ prompt: 'hi' })).toEqual(['--bg', 'hi'])
  })

  it('never emits --print alongside --bg', () => {
    // Claude Code rejects that combination before the session is created (C-006).
    // The guard is here because the failure is silent from a caller's point of view.
    expect(() => buildDispatchArgs({ prompt: 'hi', agent: '-p' })).toThrow(/--print/)
    expect(() => buildDispatchArgs({ prompt: 'hi', model: '--print' })).toThrow(/--print/)
  })

  it('refuses an empty prompt rather than starting a session with nothing to do', () => {
    expect(() => buildDispatchArgs({ prompt: '   ' })).toThrow(ClaudeAdapterError)
  })

  it('passes a prompt with spaces and non-ASCII as one argument', () => {
    // No shell is involved, so quoting is never the caller's problem.
    const prompt = 'Lập phòng ban cho tính năng OCR "mới"'
    expect(buildDispatchArgs({ prompt }).at(-1)).toBe(prompt)
  })

  it('adds every extra directory', () => {
    const args = buildDispatchArgs({ prompt: 'x', addDirs: ['D:\\a b', '/tmp/c'] })
    expect(args).toContain('--add-dir')
    expect(args.filter((a) => a === '--add-dir')).toHaveLength(2)
  })
})

describe('parseDispatchId', () => {
  it('reads the id out of the real output', () => {
    const output = [
      'backgrounded · fb9a45c6 · spike-bg-1',
      '  claude agents             list sessions',
      '  claude attach fb9a45c6    open in this terminal',
    ].join('\n')
    expect(parseDispatchId(output)).toBe('fb9a45c6')
  })

  it('survives the supervisor start-up line', () => {
    expect(parseDispatchId('Starting background service…\nbackgrounded · a152d53f · spike-inbox')).toBe(
      'a152d53f',
    )
  })

  it('returns null rather than a wrong id when the shape changes', () => {
    expect(parseDispatchId('something else entirely')).toBeNull()
    expect(parseDispatchId('')).toBeNull()
  })
})

describe('ClaudeAdapter spawning a real process', () => {
  it('runs a binary and parses its version output', async () => {
    // Node stands in for the CLI here: `node --version` prints `v22.16.0`, which is the
    // same shape `claude --version` prints. This exercises spawn, capture and parse on
    // every platform without depending on Claude Code being installed, which a CI runner
    // has no reason to have.
    const version = await new ClaudeAdapter({ binary: process.execPath }).version()
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
  }, 60_000)

  it('returns null instead of throwing when the binary is absent', async () => {
    const version = await new ClaudeAdapter({ binary: 'claude-does-not-exist-xyz' }).version()
    expect(version).toBeNull()
  }, 60_000)
})

describe('ClaudeAdapter against a real Claude Code install', () => {
  // Only where Claude Code is actually installed: a developer machine, not a CI runner.
  // Skipped rather than faked, so a green run never implies this ran when it did not.
  it('reads a version that meets the verified minimum', async () => {
    const version = await new ClaudeAdapter().version()
    if (version === null) {
      console.info('skipped: claude is not on PATH')
      return
    }
    expect(satisfiesMinimum(version, MIN_CLAUDE_VERSION), `found claude ${version}`).toBe(true)
  }, 60_000)
})
