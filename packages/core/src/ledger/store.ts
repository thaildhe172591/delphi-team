import { randomBytes } from 'node:crypto'
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import lockfile from 'proper-lockfile'
import { parse, stringify } from 'yaml'
import type { z } from 'zod'

/**
 * Several seats write the ledger at once — that is the whole point of a department — so
 * every mutation goes through a cross-process lock and lands atomically.
 *
 * Lessons this encodes, from the public issues of similar tools: state kept in a server's
 * memory disappears on resume, so everything is a file; and a half-written YAML file is
 * worse than a stale one, so writes go to a temporary file and are renamed into place.
 */

export class LedgerError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'LedgerError'
  }
}

/**
 * A ledger lock is held for a couple of milliseconds — read, transform, rename — so the
 * right policy is many short retries rather than a few long ones. Exponential backoff
 * with a 1.2-second ceiling starves later writers once a handful of seats and hooks
 * contend at once, which a 25-way concurrent append reproduces every time.
 *
 * `randomize` matters as much as the counts: without it every waiter wakes on the same
 * schedule and collides again.
 */
const RETRY = { retries: 40, factor: 1.25, minTimeout: 15, maxTimeout: 300, randomize: true } as const

/**
 * One queue per path, within this process.
 *
 * The file lock is a lottery, not a queue: every waiter retries on its own schedule and
 * nothing guarantees the unlucky one ever wins. With twenty-odd callers in one process
 * that starves reliably — a 25-way concurrent append failed twice before this existed,
 * and adding retries only moved the threshold.
 *
 * Serialising in-process turns N local callers into a single contender for the file lock,
 * so cross-process contention is bounded by the number of delphi processes, which is small.
 * It is also much faster: the common case takes the file lock once instead of N times.
 */
const queues = new Map<string, Promise<unknown>>()
const ignore = () => {}

/**
 * Run `fn` while holding an exclusive lock on `path`, against other callers in this
 * process and against other processes.
 */
export function withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const key = resolve(path)
  const previous = queues.get(key) ?? Promise.resolve()
  // A failure ahead of us in the queue must not block what comes after it.
  const run = previous.then(ignore, ignore).then(() => withFileLock(path, fn))
  const entry: Promise<unknown> = run.then(ignore, ignore).then(() => {
    // Drop the key once nothing is queued behind us, so a long session does not leak.
    if (queues.get(key) === entry) queues.delete(key)
  })
  queues.set(key, entry)
  return run
}

/**
 * proper-lockfile locks an existing file, so the file is created empty first if needed —
 * which also means a first writer and a concurrent reader never race over its existence.
 */
async function withFileLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(dirname(path), { recursive: true })
  await ensureFile(path)
  let release: (() => Promise<void>) | undefined
  try {
    release = await lockfile.lock(path, { retries: RETRY, stale: 30_000, realpath: false })
  } catch (error) {
    throw new LedgerError(
      `could not lock ${path} after ${RETRY.retries} attempts. ` +
        'Another delphi process is holding it, or a stale lock was left by one that crashed ' +
        `(remove ${path}.lock if no delphi process is running).`,
      error,
    )
  }
  try {
    return await fn()
  } finally {
    await release?.().catch(() => {
      // Releasing a lock we already lost must not mask the real error from fn().
    })
  }
}

async function ensureFile(path: string): Promise<void> {
  try {
    await writeFile(path, '', { flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
}

/**
 * Write via a temporary file in the same directory, then rename. A reader either sees the
 * old content or the new content, never a truncated file, and never an empty one because
 * the process died mid-write.
 */
export async function writeAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temp = join(dirname(path), `.${randomBytes(6).toString('hex')}.tmp`)
  await writeFile(temp, content, 'utf8')
  await rename(temp, path)
}

/** Read a file, or return `fallback` when it does not exist. Other errors still throw. */
export async function readOr(path: string, fallback: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw error
  }
}

/** Read and validate a YAML document, returning the schema's parse of `fallback` when absent. */
export async function readYaml<T extends z.ZodType>(
  path: string,
  schema: T,
  fallback: unknown,
): Promise<z.infer<T>> {
  const text = await readOr(path, '')
  const raw = text.trim() === '' ? fallback : parse(text)
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new LedgerError(`${path} does not match its schema:\n${formatIssues(result.error)}`)
  }
  return result.data
}

/** Validate, then write a YAML document atomically under a lock. */
export async function writeYaml<T extends z.ZodType>(
  path: string,
  schema: T,
  value: unknown,
): Promise<z.infer<T>> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new LedgerError(`refusing to write invalid ${path}:\n${formatIssues(result.error)}`)
  }
  await writeAtomic(path, stringify(result.data))
  return result.data
}

/**
 * Read, transform and write back, all under one lock. This is the only safe way to
 * change a shared file: a read outside the lock can be stale by the time the write lands.
 */
export async function updateYaml<T extends z.ZodType>(
  path: string,
  schema: T,
  fallback: unknown,
  update: (current: z.infer<T>) => z.infer<T> | Promise<z.infer<T>>,
): Promise<z.infer<T>> {
  return withLock(path, async () => {
    const current = await readYaml(path, schema, fallback)
    return writeYaml(path, schema, await update(current))
  })
}

/** Append one line under a lock. Used for JOURNAL.md and sessions.log. */
export async function appendLine(path: string, line: string): Promise<void> {
  await withLock(path, async () => {
    const existing = await readOr(path, '')
    const separator = existing === '' || existing.endsWith('\n') ? '' : '\n'
    await appendFile(path, `${separator}${line}\n`, 'utf8')
  })
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n')
}
