import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { createProgram } from './cli.js'

const pkg = createRequire(import.meta.url)('../package.json') as {
  version: string
  bin: Record<string, string>
  dependencies?: Record<string, string>
}

describe('delphi CLI', () => {
  it('reports the version it was built with', () => {
    expect(createProgram('9.9.9').version()).toBe('9.9.9')
  })

  it('ships exactly the two command names decided in ADR-0004', () => {
    // `dt` was dropped: it collides with DITrack and with packages on npm and PyPI.
    expect(Object.keys(pkg.bin).sort()).toEqual(['delphi', 'delphi-team'])
  })

  it('points both command names at the same entry point', () => {
    expect(new Set(Object.values(pkg.bin)).size).toBe(1)
  })
})

describe('packaging', () => {
  it('does not ship the private core package as a runtime dependency', () => {
    // tsup inlines @delphi-team/core, and core is private. Listing it under
    // `dependencies` would publish a tarball nobody can install.
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('@delphi-team/core')
  })
})

describe('the bundle', () => {
  it('declares everything core needs at runtime', () => {
    // tsup inlines @delphi-team/core, so core dependencies end up inside this package.
    // Anything undeclared gets bundled instead of resolved, and a CommonJS dependency
    // bundled into ESM fails on its first require() - which is how this was found.
    const core = createRequire(import.meta.url)('../../core/package.json') as {
      dependencies?: Record<string, string>
    }
    const declared = Object.keys(pkg.dependencies ?? {})
    for (const dependency of Object.keys(core.dependencies ?? {})) {
      expect(declared, `${dependency} is a core dependency the CLI does not declare`).toContain(dependency)
    }
  })
})

describe('the command tree', () => {
  // `.command()` returns the subcommand, so a chained builder silently registers the
  // child at the top level and loses the parent. This caught exactly that.
  const program = createProgram('0.0.0')
  const names = program.commands.map((c) => c.name())

  it('registers every documented top-level command', () => {
    for (const name of [
      'init',
      'doctor',
      'role',
      'capability',
      'team',
      'project',
      'resume',
      'state',
      'journal',
      'checkpoint',
      'story',
      'task',
      'report',
      'seat',
      'start',
      'dispatch',
      'snap',
      'hook',
      'dept',
      'shift',
      'handoff',
      'inbox',
      'next',
      'watch',
    ]) {
      expect(names, `${name} is missing`).toContain(name)
    }
  })

  it('leaks no subcommand to the top level', () => {
    for (const leaked of [
      'list',
      'new',
      'add',
      'move',
      'show',
      'build',
      'tail',
      'up',
      'down',
      'status',
      'end',
    ]) {
      expect(names, `${leaked} escaped its parent`).not.toContain(leaked)
    }
  })

  it('gives every command a description', () => {
    for (const command of program.commands) {
      expect(command.description(), `${command.name()} has none`).not.toBe('')
    }
  })

  it('offers --json wherever a skill would parse the output', () => {
    for (const name of ['init', 'doctor', 'resume', 'seat']) {
      const command = program.commands.find((c) => c.name() === name)
      const flags = command?.options.map((o) => o.long) ?? []
      expect(flags, `${name} has no --json`).toContain('--json')
    }
  })
})
