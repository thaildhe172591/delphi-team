import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BoardEntry } from '../schema/work.js'
import { BoardSchema } from '../schema/work.js'
import { addTask, BoardError, checkTransition, moveTask, openTasks, readyToStart } from './board.js'
import { appendJournal, formatEntry, isoNow, parseEntry, readJournalTail } from './journal.js'
import { LedgerPaths } from './paths.js'
import { appendLine, LedgerError, readOr, readYaml, updateYaml, writeAtomic } from './store.js'

let dir: string

beforeEach(async () => {
  // A path with a space and non-ASCII characters, because that is the environment
  // delphi targets first (PACKAGING_SPEC section 4).
  dir = await mkdtemp(join(tmpdir(), 'delphi Dự án '))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('paths', () => {
  it('lays the ledger out where MEMORY_SPEC says', () => {
    const paths = new LedgerPaths('/repo')
    const project = paths.project('ocr')
    expect(paths.config.replaceAll('\\', '/')).toBe('/repo/.delphi/config.yaml')
    expect(paths.agent('dev-be').replaceAll('\\', '/')).toBe('/repo/.claude/agents/dev-be.md')
    expect(project.board.replaceAll('\\', '/')).toBe('/repo/.delphi/projects/ocr/board.yaml')
    expect(project.report('dev-be', 'T-012', 1).replaceAll('\\', '/')).toBe(
      '/repo/.delphi/projects/ocr/reports/dev-be/T-012-1.md',
    )
  })
})

describe('store', () => {
  it('writes atomically, creating parent directories', async () => {
    const path = join(dir, 'deep', 'nested', 'file.txt')
    await writeAtomic(path, 'content')
    expect(await readFile(path, 'utf8')).toBe('content')
  })

  it('leaves no temporary files behind', async () => {
    const { readdir } = await import('node:fs/promises')
    await writeAtomic(join(dir, 'a.txt'), 'one')
    await writeAtomic(join(dir, 'a.txt'), 'two')
    expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('returns the fallback for a missing file', async () => {
    expect(await readOr(join(dir, 'absent.md'), 'default')).toBe('default')
  })

  it('refuses to write a document that fails its schema', async () => {
    await expect(
      updateYaml(join(dir, 'board.yaml'), BoardSchema, { version: 1, tasks: [] }, () => ({
        version: 1,
        tasks: [{ id: 'T-1' }],
      })),
    ).rejects.toThrow(LedgerError)
  })

  it('explains where a hand-edited file went wrong', async () => {
    const path = join(dir, 'board.yaml')
    await writeFile(path, 'version: 1\ntasks:\n  - id: T-1\n    status: nonsense\n')
    await expect(readYaml(path, BoardSchema, {})).rejects.toThrow(/tasks\.0/)
  })
})

describe('journal', () => {
  it('round-trips an entry', () => {
    const entry = {
      timestamp: '2026-09-17T10:42:00+07:00',
      id: 'T-012',
      seat: 'dev-be',
      event: 'status doing->review',
      detail: 'report: reports/dev-be/T-012-1.md',
    }
    expect(parseEntry(formatEntry(entry))).toEqual(entry)
  })

  it('does not let a field break the line format', () => {
    // A real timestamp: a line only counts as an event when it starts with one, so a
    // placeholder here would be testing a line the reader now refuses outright.
    const line = formatEntry({
      timestamp: '2026-09-17T16:50:37+07:00',
      id: 'T-1',
      seat: 'qa',
      event: 'note',
      detail: 'a | b',
    })
    expect(parseEntry(line)?.detail).toBe('a / b')
  })

  it('ignores unparseable lines instead of throwing', async () => {
    const path = join(dir, 'JOURNAL.md')
    await writeFile(path, '# JOURNAL\n\nnot an entry\n')
    await appendJournal(path, { id: 'T-1', seat: 'pm', event: 'created' })
    const tail = await readJournalTail(path, 10)
    expect(tail).toHaveLength(1)
    expect(tail[0]?.event).toBe('created')
  })

  it('returns the tail oldest first', async () => {
    const path = join(dir, 'JOURNAL.md')
    for (let i = 0; i < 5; i++) {
      await appendJournal(path, { id: `T-${i}`, seat: 'pm', event: 'created' })
    }
    const tail = await readJournalTail(path, 2)
    expect(tail.map((e) => e.id)).toEqual(['T-3', 'T-4'])
  })

  it('keeps the local offset so a journal reads in the author own time', () => {
    expect(isoNow(new Date())).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/)
  })

  // Deliberately more contention than a real department produces: the in-process queue
  // serialises these, so the wall clock is 25 lock cycles, which coverage instrumentation
  // slows well past the default 5s timeout.
  it('never loses a concurrent append', async () => {
    const path = join(dir, 'JOURNAL.md')
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => appendLine(path, `line ${String(i).padStart(2, '0')}`)),
    )
    const lines = (await readFile(path, 'utf8')).split('\n').filter(Boolean)
    expect(lines).toHaveLength(25)
    expect(new Set(lines).size).toBe(25)
  }, 60_000)
})

function task(overrides: Partial<BoardEntry> & { id: string }): BoardEntry {
  return {
    title: 'a task',
    status: 'backlog',
    owner: 'dev-be',
    type: 'feature',
    priority: 'normal',
    depends_on: [],
    updated: '2026-09-17T10:00:00+07:00',
    ...overrides,
  }
}

describe('board transitions', () => {
  const ready = { acceptance: ['it works'], files: ['src/**'] }

  it('allows the documented path forward', () => {
    expect(checkTransition(task({ id: 'T-1', status: 'backlog' }), 'ready', ready).ok).toBe(true)
    expect(checkTransition(task({ id: 'T-1', status: 'ready' }), 'doing').ok).toBe(true)
    expect(checkTransition(task({ id: 'T-1', status: 'doing' }), 'review').ok).toBe(true)
    expect(checkTransition(task({ id: 'T-1', status: 'review' }), 'done', { hasReport: true }).ok).toBe(true)
  })

  it('refuses to skip review', () => {
    const result = checkTransition(task({ id: 'T-1', status: 'doing' }), 'done', { hasReport: true })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toContain('doing -> done')
  })

  it('refuses ready without acceptance criteria or an owned file list', () => {
    const entry = task({ id: 'T-1', status: 'backlog' })
    expect(checkTransition(entry, 'ready', { files: ['src/**'] }).ok).toBe(false)
    expect(checkTransition(entry, 'ready', { acceptance: ['works'] }).ok).toBe(false)
  })

  it('refuses done without a report', () => {
    const result = checkTransition(task({ id: 'T-1', status: 'review' }), 'done')
    expect(result.ok === false && result.reason).toContain('evidence')
  })

  it('refuses blocked without a reason', () => {
    expect(checkTransition(task({ id: 'T-1', status: 'doing' }), 'blocked').ok).toBe(false)
    expect(
      checkTransition(task({ id: 'T-1', status: 'doing' }), 'blocked', { reason: 'waiting on API' }).ok,
    ).toBe(true)
  })

  it('treats done as final', () => {
    const result = checkTransition(task({ id: 'T-1', status: 'done' }), 'doing')
    expect(result.ok === false && result.reason).toContain('final state')
  })
})

describe('board file operations', () => {
  it('adds, moves and refuses a duplicate id', async () => {
    const path = join(dir, 'board.yaml')
    await addTask(path, task({ id: 'T-1' }))
    await expect(addTask(path, task({ id: 'T-1' }))).rejects.toThrow(BoardError)

    const moved = await moveTask(path, 'T-1', 'ready', { acceptance: ['works'], files: ['src/**'] })
    expect(moved.status).toBe('ready')
    expect((await readYaml(path, BoardSchema, {})).tasks[0]?.status).toBe('ready')
  })

  it('records and then clears a block reason', async () => {
    const path = join(dir, 'board.yaml')
    await addTask(path, task({ id: 'T-1', status: 'doing' }))

    const blocked = await moveTask(path, 'T-1', 'blocked', { reason: 'API contract unsettled' })
    expect(blocked.blocked_reason).toBe('API contract unsettled')

    const unblocked = await moveTask(path, 'T-1', 'doing')
    expect(unblocked.blocked_reason).toBeUndefined()
  })

  it('refuses to move a task that is not there', async () => {
    await expect(moveTask(join(dir, 'board.yaml'), 'T-99', 'ready')).rejects.toThrow(/no task T-99/)
  })

  it('leaves the file untouched when a move is rejected', async () => {
    const path = join(dir, 'board.yaml')
    await addTask(path, task({ id: 'T-1', status: 'backlog' }))
    const before = await readFile(path, 'utf8')

    await expect(moveTask(path, 'T-1', 'done', { hasReport: true })).rejects.toThrow(BoardError)
    expect(await readFile(path, 'utf8')).toBe(before)
  })
})

describe('board queries', () => {
  const board = BoardSchema.parse({
    version: 1,
    tasks: [
      task({ id: 'T-1', status: 'done' }),
      task({ id: 'T-2', status: 'ready', depends_on: ['T-1'] }),
      task({ id: 'T-3', status: 'ready', depends_on: ['T-2'] }),
      task({ id: 'T-4', status: 'ready', depends_on: ['T-99'] }),
      task({ id: 'T-5', status: 'cancelled' }),
    ],
  })

  it('counts everything that is neither done nor cancelled as open', () => {
    expect(openTasks(board).map((t) => t.id)).toEqual(['T-2', 'T-3', 'T-4'])
  })

  it('starts only what has its dependencies met', () => {
    expect(readyToStart(board).map((t) => t.id)).toEqual(['T-2'])
  })

  it('treats a dependency that is not on the board as unmet', () => {
    // Dispatching work whose input does not exist is worse than waiting for it.
    expect(readyToStart(board).map((t) => t.id)).not.toContain('T-4')
  })
})

describe('the whole ledger layout', () => {
  // The layout is a contract: a seat, a hook and the orchestrator are separate processes
  // that only agree because they compute the same paths. Pin every one of them.
  const paths = new LedgerPaths('/repo')
  const project = paths.project('ocr')
  const p = (value: string) => value.replaceAll('\\', '/')

  it('puts the shared files where MEMORY_SPEC section 2 says', () => {
    expect(p(paths.delphi)).toBe('/repo/.delphi')
    expect(p(paths.protocol)).toBe('/repo/.delphi/PROTOCOL.md')
    expect(p(paths.index)).toBe('/repo/.delphi/index.yaml')
    expect(p(paths.logs)).toBe('/repo/.delphi/logs')
    expect(p(paths.assets)).toBe('/repo/.delphi/assets')
    expect(p(paths.teams)).toBe('/repo/.delphi/teams')
    expect(p(paths.capabilities)).toBe('/repo/.delphi/capabilities')
    expect(p(paths.roles)).toBe('/repo/.delphi/roles')
    expect(p(paths.agents)).toBe('/repo/.claude/agents')
  })

  it('puts the per-project files where MEMORY_SPEC section 2 says', () => {
    expect(p(project.root)).toBe('/repo/.delphi/projects/ocr')
    expect(p(project.brief)).toBe('/repo/.delphi/projects/ocr/BRIEF.md')
    expect(p(project.state)).toBe('/repo/.delphi/projects/ocr/STATE.md')
    expect(p(project.journal)).toBe('/repo/.delphi/projects/ocr/JOURNAL.md')
    expect(p(project.decisions)).toBe('/repo/.delphi/projects/ocr/DECISIONS.md')
    expect(p(project.team)).toBe('/repo/.delphi/projects/ocr/team.yaml')
    expect(p(project.sessions)).toBe('/repo/.delphi/projects/ocr/sessions.log')
    expect(p(project.checkpoints)).toBe('/repo/.delphi/projects/ocr/checkpoints')
    expect(p(project.handoffs)).toBe('/repo/.delphi/projects/ocr/handoffs')
  })

  it('puts per-seat files under the seat that owns them', () => {
    expect(p(project.story('T-012'))).toBe('/repo/.delphi/projects/ocr/stories/T-012.md')
    expect(p(project.reportsFor('qa'))).toBe('/repo/.delphi/projects/ocr/reports/qa')
    expect(p(project.inbox('dev-fe'))).toBe('/repo/.delphi/projects/ocr/inbox/dev-fe')
    expect(p(project.knowledge('db-engineer'))).toBe('/repo/.delphi/projects/ocr/knowledge/db-engineer.md')
  })
})
