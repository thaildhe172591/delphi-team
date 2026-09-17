import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BoardSchema } from '../schema/work.js'
import { addTask, readBoard } from './board.js'
import { readJournalTail } from './journal.js'
import { readYaml } from './store.js'

/**
 * Two separate OS processes writing the same ledger file at once (WORKFLOW section 6).
 *
 * An in-process test only proves the promises are serialised; it says nothing about the
 * lock actually crossing process boundaries, which is the case that matters — a seat, a
 * hook and the orchestrator are three different processes.
 */

const run = promisify(execFile)
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const distEntry = join(packageRoot, 'dist', 'index.js')

let dir: string

beforeAll(async () => {
  // The workers import the built package, so make sure it exists. `pnpm check` builds
  // first, but running the tests alone must work too.
  if (!existsSync(distEntry)) {
    await run(
      process.execPath,
      [resolve(packageRoot, '..', '..', 'node_modules', 'typescript', 'bin', 'tsc'), '-p', packageRoot],
      {
        cwd: packageRoot,
      },
    )
  }
  expect(existsSync(distEntry), `expected a built core at ${distEntry}`).toBe(true)
}, 120_000)

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'delphi-conc-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function writeWorker(name: string, body: string): Promise<string> {
  const path = join(dir, name)
  await writeFile(
    path,
    `import { appendJournal, moveTask } from ${JSON.stringify(pathToFileURL(distEntry).href)}\n${body}\n`,
  )
  return path
}

describe('two processes writing one ledger', () => {
  it('loses no journal line', async () => {
    const journal = join(dir, 'JOURNAL.md')
    const worker = await writeWorker(
      'append.mjs',
      `const [, , path, seat, count] = process.argv
       for (let i = 0; i < Number(count); i++) {
         await appendJournal(path, { id: 'T-' + i, seat, event: 'tick' })
       }`,
    )

    const perProcess = 20
    await Promise.all([
      run(process.execPath, [worker, journal, 'dev-be', String(perProcess)]),
      run(process.execPath, [worker, journal, 'dev-fe', String(perProcess)]),
      run(process.execPath, [worker, journal, 'qa', String(perProcess)]),
    ])

    const entries = await readJournalTail(journal, 1000)
    expect(entries).toHaveLength(perProcess * 3)
    // Every line is a whole, parseable entry: no interleaved half-writes.
    for (const entry of entries) {
      expect(entry.event).toBe('tick')
      expect(['dev-be', 'dev-fe', 'qa']).toContain(entry.seat)
    }
    for (const seat of ['dev-be', 'dev-fe', 'qa']) {
      expect(entries.filter((e) => e.seat === seat)).toHaveLength(perProcess)
    }
  }, 120_000)

  it('lets exactly one process win a contested task move', async () => {
    const board = join(dir, 'board.yaml')
    await addTask(board, {
      id: 'T-1',
      title: 'contested',
      status: 'review',
      owner: 'dev-be',
      type: 'feature',
      priority: 'normal',
      depends_on: [],
      updated: '2026-09-17T10:00:00+07:00',
    })

    const worker = await writeWorker(
      'move.mjs',
      `const [, , path] = process.argv
       try {
         await moveTask(path, 'T-1', 'done', { hasReport: true })
         process.stdout.write('won')
       } catch (error) {
         process.stdout.write('lost: ' + error.message)
       }`,
    )

    const results = await Promise.all([
      run(process.execPath, [worker, board]),
      run(process.execPath, [worker, board]),
    ])
    const outcomes = results.map((r) => r.stdout)

    // `done` is terminal, so the second process must be refused rather than both
    // "succeeding" and the board silently accepting a second write.
    expect(outcomes.filter((o) => o === 'won')).toHaveLength(1)
    expect(outcomes.filter((o) => o.startsWith('lost:'))).toHaveLength(1)

    const after = await readBoard(board)
    expect(after.tasks).toHaveLength(1)
    expect(after.tasks[0]?.status).toBe('done')
  }, 120_000)

  it('never leaves a truncated or unparseable board behind', async () => {
    const board = join(dir, 'board.yaml')
    await addTask(board, {
      id: 'T-1',
      title: 'hammered',
      status: 'backlog',
      owner: 'dev-be',
      type: 'feature',
      priority: 'normal',
      depends_on: [],
      updated: '2026-09-17T10:00:00+07:00',
    })

    const worker = await writeWorker(
      'churn.mjs',
      `const [, , path, from, to] = process.argv
       for (let i = 0; i < 8; i++) {
         try { await moveTask(path, 'T-1', to, { acceptance: ['a'], files: ['src/**'], reason: 'r' }) } catch {}
         try { await moveTask(path, 'T-1', from, { acceptance: ['a'], files: ['src/**'], reason: 'r' }) } catch {}
       }`,
    )

    await Promise.all([
      run(process.execPath, [worker, board, 'backlog', 'ready']),
      run(process.execPath, [worker, board, 'backlog', 'ready']),
    ])

    // The point: whatever the interleaving, the file still parses and holds one task.
    const parsed = await readYaml(board, BoardSchema, {})
    expect(parsed.tasks).toHaveLength(1)
    expect(await readFile(board, 'utf8')).not.toBe('')
  }, 120_000)
})
