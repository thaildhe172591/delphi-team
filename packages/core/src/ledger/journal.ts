import { appendLine, readOr } from './store.js'

/**
 * The journal is append-only and one line per event (MEMORY_SPEC section 3.2):
 *
 *     2026-09-17T10:42:00+07:00 | T-012 | dev-be | status doing->review | report: reports/dev-be/T-012-1.md
 *
 * Append-only because a rewritable history is not a history. `STATE.md` is the snapshot
 * that gets rewritten; this is the record of how it got there.
 */

export interface JournalEntry {
  timestamp: string
  /** A task or decision id, or `-` for session-level events. */
  id: string
  seat: string
  event: string
  detail?: string
}

const SEPARATOR = ' | '

export function formatEntry(entry: JournalEntry): string {
  const parts = [entry.timestamp, entry.id || '-', entry.seat, entry.event]
  if (entry.detail) parts.push(entry.detail)
  // A literal separator inside a field would make the line unparseable.
  return parts.map((part) => part.replaceAll('|', '/')).join(SEPARATOR)
}

export function parseEntry(line: string): JournalEntry | null {
  const parts = line.split(SEPARATOR).map((p) => p.trim())
  const [timestamp, id, seat, event, ...rest] = parts
  if (!timestamp || !id || !seat || !event) return null
  const detail = rest.join(SEPARATOR)
  return detail ? { timestamp, id, seat, event, detail } : { timestamp, id, seat, event }
}

export async function appendJournal(
  path: string,
  entry: Omit<JournalEntry, 'timestamp'> & { timestamp?: string },
): Promise<void> {
  await appendLine(path, formatEntry({ ...entry, timestamp: entry.timestamp ?? isoNow() }))
}

/**
 * The last `count` entries, oldest first. Rehydrating an orchestrator reads the tail
 * rather than the whole file, because the budget for a session start is fixed
 * (MEMORY_SPEC section 4).
 */
export async function readJournalTail(path: string, count: number): Promise<JournalEntry[]> {
  const text = await readOr(path, '')
  const lines = text.split('\n').filter((line) => line.trim() !== '')
  return lines
    .slice(-count)
    .map(parseEntry)
    .filter((entry): entry is JournalEntry => entry !== null)
}

/** An ISO timestamp that keeps the local offset, so a journal reads in the author's own time. */
export function isoNow(date: Date = new Date()): string {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absolute = Math.abs(offsetMinutes)
  const pad = (n: number) => String(n).padStart(2, '0')
  const offset = offsetMinutes === 0 ? 'Z' : `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${offset}`
  )
}
