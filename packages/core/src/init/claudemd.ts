/**
 * The delphi block in a project's `CLAUDE.md`.
 *
 * This is how the protocol reaches every session, including teammates, and how it comes
 * back after a compaction: Claude Code re-reads the project-root CLAUDE.md and re-injects
 * it, and `@path` imports resolve relative to the importing file, up to four hops deep.
 *
 * The block is small on purpose. Every session in the project loads it, and it counts
 * against every one of their context windows, so it says where to look rather than
 * explaining anything itself.
 *
 * These markers are spelled out here rather than taken from the role-file marker helper:
 * that one prefixes every block with `delphi:`, which would make this `delphi:delphi`.
 * WORKFLOW section 3 fixes the spelling as `<!-- delphi:start -->`.
 */

export const BLOCK_START = '<!-- delphi:start -->'
export const BLOCK_END = '<!-- delphi:end -->'

export const DELPHI_BLOCK = `## Working as a department

This project uses delphi-team. Sessions here are seats in a department, not standalone chats.

@.delphi/PROTOCOL.md

- The project ledger under \`.delphi/projects/\` is the source of truth for work state. Your conversation is not.
- Change only the files your story assigns you. Anything else belongs to another seat.
- Record work through \`delphi\` commands, so the files stay locked and valid.
- If you do not know which seat you are, ask the orchestrator rather than guessing.`

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

export function hasDelphiBlock(text: string): boolean {
  return findBlock(text) !== null
}

function renderBlock(): string {
  return `${BLOCK_START}\n${DELPHI_BLOCK}\n${BLOCK_END}`
}

/**
 * Add or refresh the delphi block, leaving everything the user wrote untouched.
 *
 * Running it twice produces the same file.
 */
export function mergeClaudeMd(existing: string): {
  content: string
  change: 'added' | 'refreshed' | 'unchanged'
} {
  const block = findBlock(existing)

  if (block) {
    if (block.content === DELPHI_BLOCK.trim()) return { content: existing, change: 'unchanged' }
    const content = existing.slice(0, block.start) + renderBlock() + existing.slice(block.end)
    return { content, change: 'refreshed' }
  }

  const base = existing.trim() === '' ? '# Project instructions\n' : existing
  const separator = base.endsWith('\n\n') ? '' : base.endsWith('\n') ? '\n' : '\n\n'
  return { content: `${base}${separator}${renderBlock()}\n`, change: 'added' }
}

/** Remove the delphi block and nothing else. */
export function removeClaudeMd(existing: string): { content: string; removed: boolean } {
  const block = findBlock(existing)
  if (!block) return { content: existing, removed: false }

  const before = existing.slice(0, block.start).replace(/\n{2,}$/, '\n')
  const after = existing.slice(block.end).replace(/^\n+/, '')
  const joined = after === '' ? before : `${before}\n${after}`
  return { content: `${joined.trimEnd()}\n`, removed: true }
}
