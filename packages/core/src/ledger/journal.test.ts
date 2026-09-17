import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseEntry, readJournalTail } from './journal.js'

/**
 * Both of these were found by running `delphi watch` against a real project.
 *
 * The journal template explains its own format on a line that happens to contain four
 * pipe-separated fields, so the parser read it as an event and `watch` printed "SO ti"
 * where the time goes — the eleventh to sixteenth characters of "Format: `<ISO time>".
 */

const TEMPLATE_HEAD = [
  '# JOURNAL',
  '',
  'Append only, one line per event. Never edit a line: add a new one.',
  'Format: `<ISO time> | <id> | <seat> | <event> | <detail>`',
  '',
]

describe('reading a journal line', () => {
  it('takes a line that starts with a timestamp', () => {
    const entry = parseEntry('2026-09-17T16:50:37+07:00 | T-001 | dev-be | status -> ready | board.yaml')
    expect(entry).toEqual({
      timestamp: '2026-09-17T16:50:37+07:00',
      id: 'T-001',
      seat: 'dev-be',
      event: 'status -> ready',
      detail: 'board.yaml',
    })
  })

  it('refuses prose that happens to have four fields', () => {
    for (const line of [
      'Format: `<ISO time> | <id> | <seat> | <event> | <detail>`',
      '| id | status | owner | title |',
      'a | b | c | d',
    ]) {
      expect(parseEntry(line), line).toBeNull()
    }
  })
})

describe('the journal tail', () => {
  it('skips the template preamble and counts events, not lines', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'delphi-journal-'))
    const path = join(dir, 'JOURNAL.md')
    const events = Array.from(
      { length: 5 },
      (_, i) => `2026-09-17T16:5${i}:00+07:00 | T-00${i} | dev-be | event ${i}`,
    )
    writeFileSync(path, [...TEMPLATE_HEAD, ...events, ''].join('\n'), 'utf8')

    // Asking for four must give four events, not four lines of which some were prose.
    const tail = await readJournalTail(path, 4)
    expect(tail).toHaveLength(4)
    expect(tail.map((e) => e.event)).toEqual(['event 1', 'event 2', 'event 3', 'event 4'])
  })

  it('is empty for a journal that has only its template', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'delphi-journal-'))
    const path = join(dir, 'JOURNAL.md')
    writeFileSync(path, TEMPLATE_HEAD.join('\n'), 'utf8')
    expect(await readJournalTail(path, 8)).toEqual([])
  })
})
