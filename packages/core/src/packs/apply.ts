import { parseDocument } from 'yaml'

/**
 * Merging a pack into a project's `.delphi/config.yaml`.
 *
 * The config that ships is two thirds comments, and they are the part that explains why the
 * numbers are what they are. Parsing it and writing it back out would silently delete all of
 * that, so this edits the document in place through `yaml`'s own document API: the comments,
 * the ordering and the user's own additions survive untouched.
 *
 * Nothing here writes a file. It returns the new text and the list of what changed, because
 * a command that edits someone's configuration owes them a diff before it does.
 */

export interface ConfigChange {
  /** Dotted path, as a person would say it: `models.dev-be.model`. */
  path: string
  from: string
  to: string
}

export interface ConfigMerge {
  content: string
  changes: ConfigChange[]
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const show = (value: unknown): string =>
  value === undefined ? '(not set)' : Array.isArray(value) ? JSON.stringify(value) : String(value)

/**
 * Apply a pack's `config` block to an existing config file.
 *
 * Descends into nested maps rather than replacing them, so a pack that sets
 * `dispatch.max_active` leaves the rest of `dispatch` — and its comments — alone.
 */
export function mergeConfigInto(existing: string, config: unknown): ConfigMerge {
  const doc = parseDocument(existing)
  const changes: ConfigChange[] = []

  const walk = (value: unknown, path: string[]): void => {
    if (isPlainObject(value)) {
      for (const [key, nested] of Object.entries(value)) walk(nested, [...path, key])
      return
    }
    if (path.length === 0) return

    // `getIn(path, true)` keeps nodes; `false` asks for the plain value, which is what a
    // diff should compare.
    const current = doc.getIn(path, false)

    if (show(current) === show(value)) return
    changes.push({ path: path.join('.'), from: show(current), to: show(value) })
    doc.setIn(path, value)
  }

  walk(config, [])
  return { content: changes.length === 0 ? existing : doc.toString(), changes }
}
