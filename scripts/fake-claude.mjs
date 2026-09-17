#!/usr/bin/env node
/**
 * A stand-in for the `claude` binary, so the money path can be run without spending money.
 *
 * `delphi loop` is the only command that starts sessions on its own. Testing it against the
 * real binary costs quota every time and cannot be repeated freely, so the parts that matter
 * — does it stop when it should, does the prompt arrive intact, does it read the board back —
 * are exercised against this instead. Point `DELPHI_CLAUDE_BIN` at this file.
 *
 * It behaves like a seat: each `--bg` dispatch moves the board on and, when the script says
 * to, files a report. `scripts/loop-lab.mjs` drives it; see `docs/try-it.md`.
 *
 * The shebang matters. execa follows it to `node` and spawns that directly, which is how a
 * multi-line prompt reaches this file at all (C-017).
 *
 * Environment:
 *   FAKE_STATE    where to keep the dispatch counter and the session list
 *   FAKE_LOG      one JSON line per dispatch: argv, prompt, line count
 *   FAKE_BOARD    the board.yaml to move
 *   FAKE_REPORTS  the reports directory
 *   FAKE_TASK     the task id reports are filed under
 *   FAKE_SCRIPT   JSON array, one entry per dispatch:
 *                 {status?, report?: {seat, outcome}, waiting?: true}
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const argv = process.argv.slice(2)
const statePath = process.env.FAKE_STATE

const readState = () => {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'))
  } catch {
    return { dispatches: 0, sessions: [] }
  }
}

if (argv[0] === '--version') {
  process.stdout.write('2.1.274 (Claude Code)\n')
  process.exit(0)
}

if (argv[0] === 'agents') {
  process.stdout.write(JSON.stringify(readState().sessions))
  process.exit(0)
}

if (argv[0] === '--bg') {
  const state = readState()
  state.dispatches += 1
  // Session ids are hex; `parseDispatchId` will not match anything else.
  const id = `beef0${state.dispatches}`
  const prompt = argv[argv.length - 1]

  appendFileSync(
    process.env.FAKE_LOG,
    `${JSON.stringify({
      dispatch: state.dispatches,
      argv: argv.slice(0, -1),
      promptLines: prompt.split('\n').length,
      prompt,
    })}\n`,
  )

  const script = JSON.parse(process.env.FAKE_SCRIPT)[state.dispatches - 1]

  if (script?.status) {
    const board = readFileSync(process.env.FAKE_BOARD, 'utf8')
    writeFileSync(process.env.FAKE_BOARD, board.replace(/status: \w+/, `status: ${script.status}`), 'utf8')
  }
  if (script?.report) {
    const file = join(process.env.FAKE_REPORTS, script.report.seat, `${process.env.FAKE_TASK}-1.md`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(
      file,
      `# Report\n\n## Outcome\n${script.report.outcome}\n\n## What I did\nnothing\n`,
      'utf8',
    )
  }

  state.sessions = [
    {
      kind: 'background',
      id,
      name: 'fake',
      state: script?.waiting ? 'working' : 'done',
      // This is how a seat stuck on a permission prompt announces itself.
      ...(script?.waiting ? { waitingFor: 'permission prompt' } : {}),
      cwd: process.cwd(),
      startedAt: Date.now(),
    },
  ]
  writeFileSync(statePath, JSON.stringify(state), 'utf8')
  process.stdout.write(`backgrounded · ${id} · fake\n`)
  process.exit(0)
}

process.stderr.write(`fake-claude: unhandled ${argv.join(' ')}\n`)
process.exit(1)
