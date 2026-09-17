/**
 * How commands talk.
 *
 * Every command supports `--json`, because a skill invoking delphi through Bash needs a
 * shape it can rely on, and a person reading a terminal needs something else entirely.
 * Both come from the same call, so they cannot drift apart.
 */

export const EXIT = {
  ok: 0,
  /** The user asked for something that cannot be done. */
  userError: 1,
  /** Something is wrong with the project, and the command refused rather than guessing. */
  invalidState: 2,
  /** An action that needs approval has not been approved. */
  notApproved: 3,
} as const

export interface Reporter {
  json: boolean
  /** Machine-readable result. In human mode, `human` is printed instead. */
  emit(data: unknown, human: () => void): void
  line(text?: string): void
  warn(text: string): void
  error(text: string, hint?: string): void
}

export function createReporter(json: boolean): Reporter {
  return {
    json,
    emit(data, human) {
      if (json) process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
      else human()
    },
    line(text = '') {
      if (!json) process.stdout.write(`${text}\n`)
    },
    warn(text) {
      if (!json) process.stderr.write(`warning: ${text}\n`)
    },
    error(text, hint) {
      process.stderr.write(`error: ${text}\n`)
      if (hint) process.stderr.write(`${hint}\n`)
    },
  }
}

/** Pad a column without pulling in a table library for six rows. */
export function columns(rows: string[][], gap = 2): string[] {
  const widths: number[] = []
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length)
    })
  }
  return rows.map((row) =>
    row
      .map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i] ?? 0)))
      .join(' '.repeat(gap))
      .trimEnd(),
  )
}

/** `12 files` / `1 file` — getting this wrong in output reads as carelessness. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
