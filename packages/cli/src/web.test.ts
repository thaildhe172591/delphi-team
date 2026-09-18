import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isInside } from './web.js'

/**
 * The guard on every path the web view serves.
 *
 * `delphi watch --web` reads files chosen by a query string, which is the oldest way there
 * is to hand someone `../../../.ssh/id_rsa`. It binds to localhost, so this is a second
 * lock rather than the only one — but a dashboard that serves a path it was given is a
 * dashboard that serves any path it is given.
 */

const root = join(sep, 'projects', 'demo', '.delphi', 'projects', 'checkout')

describe('what the web view will serve', () => {
  it('serves a file inside the project ledger', () => {
    expect(isInside(root, join(root, 'reports', 'dev-be', 'T-001-1.md'))).toBe(true)
  })

  it('refuses to climb out with ..', () => {
    expect(isInside(root, join(root, '..', '..', '..', 'config.yaml'))).toBe(false)
    expect(isInside(root, join(root, 'reports', '..', '..', '..', '..', 'secrets.env'))).toBe(false)
  })

  it('refuses a sibling whose name merely starts the same way', () => {
    // A prefix comparison would let `checkout-old` through, because its path starts with
    // every character of `checkout`.
    expect(isInside(root, `${root}-old${sep}board.yaml`)).toBe(false)
  })

  it('refuses the directory itself, which is not a file to serve', () => {
    expect(isInside(root, root)).toBe(false)
  })

  it('refuses an absolute path somewhere else entirely', () => {
    expect(isInside(root, join(sep, 'etc', 'passwd'))).toBe(false)
  })
})
