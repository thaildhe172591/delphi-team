import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isInside, isLocalHost } from './web.js'

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

describe('which Host header the web view answers to', () => {
  it('answers to the names it is actually reachable at', () => {
    for (const host of ['127.0.0.1:4173', 'localhost:4173', '[::1]:4173', 'LOCALHOST:4173']) {
      expect(isLocalHost(host, 4173), host).toBe(true)
    }
  })

  it('refuses a hostname someone else controls, which is the rebinding case', () => {
    // Binding to 127.0.0.1 does not stop this: the browser making the request is on this
    // machine. The attacker's own hostname in the header is what gives it away.
    for (const host of ['evil.example.com:4173', 'ledger.attacker.test:4173', '10.0.0.5:4173']) {
      expect(isLocalHost(host, 4173), host).toBe(false)
    }
  })

  it('refuses the right name on the wrong port, and a missing header', () => {
    expect(isLocalHost('127.0.0.1:9999', 4173)).toBe(false)
    expect(isLocalHost('localhost', 4173)).toBe(false)
    expect(isLocalHost(undefined, 4173)).toBe(false)
  })
})
