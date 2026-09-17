import { describe, expect, it } from 'vitest'
import { orchestratorMayEdit } from './hook.js'

/**
 * The orchestrator gate, which had a false deny in it.
 *
 * The allow-list matched `/.delphi/` with a leading separator, so an absolute path passed
 * and a relative one did not — the orchestrator was refused its own ledger. A gate that
 * wrongly allows costs a tidier diff; a gate that wrongly denies costs the shift.
 */
describe('what the orchestrator may edit', () => {
  it('allows the ledger, the docs and the seat files, however the path is written', () => {
    for (const path of [
      '.delphi/projects/checkout/STATE.md',
      'D:/dev/demo/.delphi/projects/checkout/board.yaml',
      'D:\\dev\\demo\\.delphi\\projects\\checkout\\board.yaml',
      '/home/me/demo/.delphi/index.yaml',
      'docs/project-context.md',
      '.claude/agents/dev-be.md',
    ]) {
      expect(orchestratorMayEdit(path), path).toBe(true)
    }
  })

  it('refuses source code, which is what the gate is for', () => {
    for (const path of [
      'src/server.js',
      'D:/dev/demo/src/server.js',
      'packages/core/src/index.ts',
      'README.md',
    ]) {
      expect(orchestratorMayEdit(path), path).toBe(false)
    }
  })
})
