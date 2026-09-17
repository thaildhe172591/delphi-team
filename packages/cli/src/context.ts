import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  type Config,
  ConfigSchema,
  LedgerPaths,
  type ProjectIndex,
  ProjectIndexSchema,
  readYaml,
} from '@delphi-team/core'
import { parse } from 'yaml'

/**
 * Where we are and what is configured.
 *
 * Commands are run from anywhere inside a project, so the root is found by walking up —
 * the same way git does — rather than assuming the current directory.
 */

export class UserError extends Error {
  constructor(
    message: string,
    /** What the user can do about it. */
    readonly hint?: string,
  ) {
    super(message)
    this.name = 'UserError'
  }
}

/** Walk up looking for `.delphi`, then for `.git`, then give up at the filesystem root. */
export function findProjectRoot(from = process.cwd()): string | null {
  let current = resolve(from)
  let gitRoot: string | null = null

  for (;;) {
    if (existsSync(join(current, '.delphi'))) return current
    if (gitRoot === null && existsSync(join(current, '.git'))) gitRoot = current
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return gitRoot
}

export interface Context {
  root: string
  paths: LedgerPaths
  config: Config
  /** False when the project has a root but no `.delphi` yet. */
  initialised: boolean
}

export async function loadContext(from = process.cwd()): Promise<Context> {
  const root = findProjectRoot(from)
  if (!root) {
    throw new UserError('not inside a project', 'run this from a git repository, or run `delphi init` first')
  }

  const paths = new LedgerPaths(root)
  const initialised = existsSync(paths.delphi)

  let config: Config
  if (initialised && existsSync(paths.config)) {
    const text = await readFile(paths.config, 'utf8')
    const parsed = ConfigSchema.safeParse(parse(text))
    if (!parsed.success) {
      throw new UserError(
        `${paths.config} does not match the schema`,
        parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n'),
      )
    }
    config = parsed.data
  } else {
    config = ConfigSchema.parse({ version: 1 })
  }

  return { root, paths, config, initialised }
}

/** Fail with a clear message rather than a stack trace when the project is not set up. */
export async function requireInitialised(from = process.cwd()): Promise<Context> {
  const context = await loadContext(from)
  if (!context.initialised) {
    throw new UserError('this project has no .delphi directory', 'run `delphi init` first')
  }
  return context
}

export async function readIndex(context: Context): Promise<ProjectIndex> {
  return readYaml(context.paths.index, ProjectIndexSchema, { version: 1, projects: [] })
}

/**
 * Which project a command applies to.
 *
 * With one project open the answer is obvious; with several it is a question, not a guess.
 * Continuing the wrong project is worse than one prompt.
 */
export async function resolveProject(context: Context, requested?: string): Promise<string> {
  const index = await readIndex(context)
  if (requested) {
    if (!index.projects.some((p) => p.slug === requested)) {
      throw new UserError(`no project "${requested}"`, 'run `delphi project list` to see what exists')
    }
    return requested
  }

  const open = index.projects.filter((p) => p.status === 'open')
  if (open.length === 1) return open[0]?.slug as string
  if (open.length === 0) {
    throw new UserError('no project is open', 'run `delphi project new <slug> --title "..."`')
  }
  throw new UserError(
    `${open.length} projects are open`,
    `pass --project with one of: ${open.map((p) => p.slug).join(', ')}`,
  )
}
