/**
 * Keeping a seat's memory inside the window Claude Code actually preloads.
 *
 * `MEMORY.md` is preloaded as the **first 200 lines or 25 KB**, whichever comes first.
 * Past that, the rest of the file exists but is never read at startup — so a seat that
 * keeps appending eventually loses the beginning of its own memory without being told.
 *
 * Compaction here does not decide what is worth keeping. It cannot: only the seat knows
 * which lesson still applies. What it does is move the overflow into an archive beside
 * the file, so nothing is lost and the preloaded part is the part that fits.
 */

export interface CompactResult {
  /** What MEMORY.md becomes. */
  kept: string
  /** What moves to the archive, or null when nothing had to. */
  archived: string | null
  keptLines: number
  archivedLines: number
  /** True when the file already fitted and nothing changed. */
  unchanged: boolean
}

export interface MemoryLimits {
  /** Claude Code preloads at most this many lines. */
  maxLines: number
  /** …or this many bytes, whichever comes first. */
  maxBytes: number
}

export const CLAUDE_MEMORY_LIMITS: MemoryLimits = { maxLines: 200, maxBytes: 25_000 }

/** Does this file already fit in the preload window? */
export function fitsInPreload(text: string, limits: MemoryLimits = CLAUDE_MEMORY_LIMITS): boolean {
  return text.split('\n').length <= limits.maxLines && Buffer.byteLength(text, 'utf8') <= limits.maxBytes
}

/**
 * Split a memory file at the last section boundary that still fits.
 *
 * Sections are `##` headings. Cutting at a heading rather than a line number means the
 * archive starts with something that reads as a whole, and the kept part never ends
 * mid-sentence.
 */
export function compactMemory(
  text: string,
  threshold: number,
  limits: MemoryLimits = CLAUDE_MEMORY_LIMITS,
): CompactResult {
  const target = Math.min(threshold, limits.maxLines)
  const lines = text.split('\n')

  if (lines.length <= target && Buffer.byteLength(text, 'utf8') <= limits.maxBytes) {
    return {
      kept: text,
      archived: null,
      keptLines: lines.length,
      archivedLines: 0,
      unchanged: true,
    }
  }

  // Walk back from the target to the nearest section heading, so the cut lands cleanly.
  let cut = Math.min(target, lines.length)
  while (cut > 0 && !(lines[cut]?.startsWith('## ') ?? false)) cut--
  // No heading to cut at: fall back to the line limit rather than keeping nothing.
  if (cut === 0) cut = Math.min(target, lines.length)

  const kept = lines.slice(0, cut).join('\n').trimEnd()
  const archived = lines.slice(cut).join('\n').trim()

  return {
    kept: `${kept}\n`,
    archived: archived === '' ? null : `${archived}\n`,
    keptLines: cut,
    archivedLines: lines.length - cut,
    unchanged: false,
  }
}

/** The note appended to an archive, so whoever opens it knows why it is there. */
export function archiveHeader(seat: string, when: string): string {
  return [
    `# Archived memory — ${seat}`,
    '',
    `Moved out of MEMORY.md on ${when} so the file fits the window Claude Code preloads`,
    `(the first ${CLAUDE_MEMORY_LIMITS.maxLines} lines or ${CLAUDE_MEMORY_LIMITS.maxBytes / 1000} KB).`,
    '',
    'Nothing here was deleted. If something below still matters, move it back to the top of',
    'MEMORY.md — the top is the part that gets read.',
    '',
    '---',
    '',
  ].join('\n')
}
