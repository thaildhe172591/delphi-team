import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveWindowsShim } from './claude.js'

/**
 * The defect this pins cost a whole feature: every background dispatch on Windows failed,
 * because `claude` on PATH is a `.cmd` shim, a `.cmd` can only run through `cmd.exe`, and
 * `cmd.exe` treats the line breaks in a spawn prompt as command separators. Reading it
 * never showed it. Running it did, immediately.
 */

const npmShim = (exe: string) =>
  [
    '@ECHO off',
    'GOTO start',
    ':find_dp0',
    'SET dp0=%~dp0',
    'EXIT /b',
    ':start',
    'SETLOCAL',
    'CALL :find_dp0',
    `"%dp0%\\${exe}"   %*`,
  ].join('\r\n')

function fixture(): { dir: string; shim: string; exe: string } {
  const dir = mkdtempSync(join(tmpdir(), 'delphi-shim-'))
  const exeDir = join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin')
  mkdirSync(exeDir, { recursive: true })

  const exe = join(exeDir, 'claude.exe')
  writeFileSync(exe, 'not really an executable')
  const shim = join(dir, 'claude.cmd')
  writeFileSync(shim, npmShim('node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe'))
  return { dir, shim, exe }
}

describe('resolving a Windows shim', () => {
  it('finds the executable an npm .cmd shim calls', () => {
    const { shim, exe } = fixture()
    expect(resolveWindowsShim(shim, {}, 'win32')).toBe(exe)
  })

  it('finds it through PATH, the way the command is actually written', () => {
    const { dir, exe } = fixture()
    expect(resolveWindowsShim('claude', { PATH: dir, PATHEXT: '.COM;.EXE;.BAT;.CMD' }, 'win32')).toBe(exe)
  })

  it('leaves a real .exe alone, because execa spawns one directly', () => {
    const { dir, exe } = fixture()
    writeFileSync(join(dir, 'claude.exe'), 'not really an executable')
    // PATHEXT puts .EXE first, so this is what Windows itself would pick.
    expect(resolveWindowsShim('claude', { PATH: dir, PATHEXT: '.COM;.EXE;.BAT;.CMD' }, 'win32')).toBe(
      undefined,
    )
    expect(exe).toContain('claude.exe')
  })

  it('does nothing off Windows, where a shebang is the OS problem', () => {
    const { shim } = fixture()
    expect(resolveWindowsShim(shim, {}, 'linux')).toBe(undefined)
  })

  it('gives up rather than guessing when the shim names nothing that exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'delphi-shim-'))
    const shim = join(dir, 'claude.cmd')
    writeFileSync(shim, npmShim('bin\\gone.exe'))
    expect(resolveWindowsShim(shim, {}, 'win32')).toBe(undefined)
  })

  it('gives up on a shim it cannot read, rather than throwing mid-dispatch', () => {
    expect(resolveWindowsShim(join(tmpdir(), 'delphi-no-such-shim.cmd'), {}, 'win32')).toBe(undefined)
    expect(resolveWindowsShim('claude', { PATH: '', PATHEXT: '.CMD' }, 'win32')).toBe(undefined)
  })
})
