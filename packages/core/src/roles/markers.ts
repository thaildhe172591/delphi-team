/**
 * Marked blocks let `delphi role build` regenerate the parts it owns while leaving the
 * user's own notes untouched across package upgrades (CUSTOMIZATION_SPEC section 1).
 *
 * A generated role file looks like:
 *
 *     <!-- delphi:core:start -->      …regenerated from the base role
 *     <!-- delphi:core:end -->
 *     <!-- delphi:capabilities:start -->  …regenerated from the capability packs
 *     <!-- delphi:capabilities:end -->
 *     <!-- delphi:project:start -->   …the user's, never overwritten
 *     <!-- delphi:project:end -->
 */

export type BlockName = 'core' | 'capabilities' | 'project'

export function startMarker(name: string): string {
  return `<!-- delphi:${name}:start -->`
}

export function endMarker(name: string): string {
  return `<!-- delphi:${name}:end -->`
}

function markerPattern(name: string): RegExp {
  // Markers are literal and contain no regex metacharacters beyond `-`, which is safe here.
  return new RegExp(
    `${escapeRegex(startMarker(name))}\\r?\\n?([\\s\\S]*?)\\r?\\n?${escapeRegex(endMarker(name))}`,
  )
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The contents of a block, or null when the block is absent. */
export function extractBlock(text: string, name: string): string | null {
  const match = markerPattern(name).exec(text)
  return match ? (match[1] ?? '') : null
}

/**
 * Replace a block's contents, keeping everything around it byte-identical.
 * Appends the block at the end when it is missing, so an older generated file upgrades
 * cleanly instead of silently losing the new section.
 */
export function replaceBlock(text: string, name: string, content: string): string {
  const block = `${startMarker(name)}\n${content}\n${endMarker(name)}`
  const pattern = markerPattern(name)
  if (pattern.test(text)) return text.replace(pattern, block)
  const separator = text.length === 0 || text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n'
  return `${text}${separator}${block}\n`
}

/** True when the text has both markers for the block, in the right order. */
export function hasBlock(text: string, name: string): boolean {
  const start = text.indexOf(startMarker(name))
  const end = text.indexOf(endMarker(name))
  return start !== -1 && end > start
}
