/**
 * The Claude Code release delphi-team was verified against in Phase 0 (2026-09-17).
 * Everything in `docs/research/claude-code-capabilities.md` was confirmed on this version;
 * `delphi doctor` warns rather than vouches when it finds something older.
 */
export const MIN_CLAUDE_VERSION = '2.1.274'

/** `claude --version` prints e.g. `2.1.274 (Claude Code)`. Returns the bare version, or null. */
export function parseClaudeVersion(output: string): string | null {
  const match = /(\d+(?:\.\d+)*)/.exec(output)
  return match?.[1] ?? null
}

/**
 * Compare two dotted numeric versions. Segment-wise and numeric, because the
 * obvious lexical compare gets `2.1.9` vs `2.1.274` backwards. Missing segments
 * count as 0, so `2.1` equals `2.1.0`. Non-numeric segments count as 0 too.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const left = a.split('.')
  const right = b.split('.')
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i++) {
    const x = Number.parseInt(left[i] ?? '0', 10) || 0
    const y = Number.parseInt(right[i] ?? '0', 10) || 0
    if (x < y) return -1
    if (x > y) return 1
  }
  return 0
}

/** True when `found` is at least `minimum`. */
export function satisfiesMinimum(found: string, minimum: string = MIN_CLAUDE_VERSION): boolean {
  return compareVersions(found, minimum) >= 0
}
