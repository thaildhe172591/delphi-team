import { describe, expect, it } from 'vitest'
import { resolveSurface, type SurfaceFacts } from './surface.js'

/**
 * `auto` exists because the default used to be `none`: every dispatch started a seat that
 * worked, finished and told you afterwards through the ledger. The rule is about *where*
 * the panes land — splitting the terminal you are already in is the only thing that feels
 * like splitting, and panes in a window you have to go and find are worse than none.
 */

const facts = (overrides: Partial<SurfaceFacts> = {}): SurfaceFacts => ({
  platform: 'win32',
  inTmux: false,
  inVsCode: false,
  ...overrides,
})

describe('resolving auto', () => {
  it('splits tmux when it is what you are sitting in', () => {
    expect(resolveSurface('auto', facts({ inTmux: true }))).toBe('tmux')
    // Even on Windows: being inside tmux is a stronger signal than the platform.
    expect(resolveSurface('auto', facts({ inTmux: true, platform: 'win32' }))).toBe('tmux')
  })

  it('leaves the VS Code terminal to the companion extension', () => {
    // Throwing a Windows Terminal window at someone working in the editor is the jarring
    // case this avoids.
    expect(resolveSurface('auto', facts({ inVsCode: true }))).toBe('vscode')
  })

  it('splits the current Windows Terminal window otherwise', () => {
    expect(resolveSurface('auto', facts())).toBe('wt')
  })

  it('does nothing where there is nothing it knows how to split', () => {
    // No probe for Windows Terminal: installed from the Store, `wt.exe` is an app
    // execution alias that Node cannot stat, so the obvious check says "not installed"
    // for a program the shell runs happily. Running it is the test.
    expect(resolveSurface('auto', facts({ platform: 'linux' }))).toBe('none')
    expect(resolveSurface('auto', facts({ platform: 'darwin' }))).toBe('none')
  })
})

describe('an explicit choice', () => {
  it('is obeyed, even when auto would have picked something else', () => {
    // Someone who typed `--surface none` gets none, inside tmux or not.
    expect(resolveSurface('none', facts({ inTmux: true }))).toBe('none')
    expect(resolveSurface('wt', facts({ platform: 'linux' }))).toBe('wt')
    expect(resolveSurface('tmux', facts())).toBe('tmux')
  })
})
