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
