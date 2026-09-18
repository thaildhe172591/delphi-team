/**
 * The delphi block in a project's `.gitattributes`.
 *
 * delphi writes every ledger file with LF, on every platform, so that the same board looks
 * the same on two machines. Git on Windows defaults to `core.autocrlf=true` and checks that
 * ledger back out as CRLF — and then the next line delphi appends is LF, the file is mixed,
 * and `git status` reports the whole thing as changed. Nobody edited it.
 *
 * One line of `.gitattributes` settles it, which is what this repository does for itself.
 *
 * The markers are `#` comments rather than the HTML ones the role files use, because
 * `.gitattributes` has no comment syntax but `#`. Everything outside them is the user's.
 */

export const BLOCK_START = '# delphi:start'
export const BLOCK_END = '# delphi:end'

export const DELPHI_BLOCK = `# delphi writes the ledger with LF on every platform. Without these, git on Windows checks
# it out as CRLF and every line delphi appends then shows as a whole-file change.
.delphi/** text eol=lf
.claude/** text eol=lf`

interface BlockBounds {
  start: number
  end: number
  content: string
}

function findBlock(text: string): BlockBounds | null {
  const start = text.indexOf(BLOCK_START)
  if (start === -1) return null
  const endIndex = text.indexOf(BLOCK_END, start)
  if (endIndex === -1) return null
  return {
    start,
    end: endIndex + BLOCK_END.length,
    content: text.slice(start + BLOCK_START.length, endIndex).trim(),
  }
}

function renderBlock(): string {
  return `${BLOCK_START}\n${DELPHI_BLOCK}\n${BLOCK_END}`
}

/**
 * Add or refresh the delphi block, leaving every rule the user wrote untouched.
 *
 * Running it twice produces the same file.
 */
export function mergeGitattributes(existing: string): {
  content: string
  change: 'added' | 'refreshed' | 'unchanged'
} {
  const block = findBlock(existing)

  if (block) {
    if (block.content === DELPHI_BLOCK.trim()) return { content: existing, change: 'unchanged' }
    const content = existing.slice(0, block.start) + renderBlock() + existing.slice(block.end)
    return { content, change: 'refreshed' }
  }

  // A user rule that already matches these paths wins: it is below ours in the file, and
  // git takes the last match. Adding at the end would silently override what they chose.
  const base = existing.trim() === '' ? '' : existing
  const separator = base === '' ? '' : base.endsWith('\n\n') ? '' : base.endsWith('\n') ? '\n' : '\n\n'
  return { content: `${renderBlock()}\n${separator === '' ? '' : '\n'}${base}`, change: 'added' }
}
