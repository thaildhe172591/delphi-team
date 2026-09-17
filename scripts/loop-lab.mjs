#!/usr/bin/env node
/**
 * Run `delphi loop` end to end, for free, and check that it stops when it should.
 *
 * The loop is the only command that starts sessions on its own, so the thing worth proving
 * is not that it works — it is that it stops. Each case below puts the department in a state
 * that should end the run, and asserts the run ended for that reason and spent no more than
 * it should have.
 *
 * Nothing here touches the real `claude`: `DELPHI_CLAUDE_BIN` points at scripts/fake-claude.mjs.
 *
 * Usage: node scripts/loop-lab.mjs [directory]
 * Exits non-zero if any case behaves differently from what is written here.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const cli = join(repo, 'packages', 'cli', 'dist', 'index.js')
const fake = join(here, 'fake-claude.mjs')
const lab = resolve(process.argv[2] ?? join(tmpdir(), 'delphi-loop-lab'))

const boardPath = join(lab, '.delphi', 'projects', 'demo', 'board.yaml')
const storyPath = join(lab, '.delphi', 'projects', 'demo', 'stories', 'T-001.md')

const run = (args, env = {}) =>
  execFileSync(process.execPath, [cli, ...args], {
    cwd: lab,
    encoding: 'utf8',
    input: '',
    env: { ...process.env, ...env },
  })

function setUp() {
  rmSync(lab, { recursive: true, force: true })
  mkdirSync(lab, { recursive: true })

  // delphi refuses to initialise outside a repository, which is the same check a user hits.
  execFileSync('git', ['init', '-q', '.'], { cwd: lab, stdio: 'ignore' })

  run(['init', '--yes'])
  run(['project', 'new', 'demo', '--title', 'Loop lab'])
  run(['story', 'new', 'T-001', '--title', 'Add a health endpoint', '--owner', 'dev-be', '--project', 'demo'])

  // A story without files and acceptance criteria is refused before anything is dispatched,
  // so fill them in the way a tech lead would.
  const story = readFileSync(storyPath, 'utf8')
    .replace(/^files: .*$/m, 'files: ["src/health.ts"]')
    .replace(/^deliverables: .*$/m, 'deliverables: ["src/health.ts"]')
    .replace(/^acceptance: .*$/m, 'acceptance: ["GET /health returns 200"]')
    .replace(/^verify: .*$/m, 'verify: "npm test"')
  writeFileSync(storyPath, story, 'utf8')

  run(['task', 'move', 'T-001', 'ready', '--project', 'demo'])
}

/** Put the board back to where each case starts. */
function reset() {
  writeFileSync(boardPath, readFileSync(boardPath, 'utf8').replace(/status: \w+/, 'status: ready'), 'utf8')
  rmSync(join(lab, '.delphi', 'projects', 'demo', 'reports'), { recursive: true, force: true })
  rmSync(join(lab, 'fake-state.json'), { force: true })
  rmSync(join(lab, 'fake-log.jsonl'), { force: true })
}

function loop(script, extra = []) {
  reset()
  // `--surface none`: the lab dispatches eight times across the cases, and every dispatch
  // now opens a pane. A test run must not carpet the screen in terminals.
  const args = ['loop', '--project', 'demo', '--yes', '--poll', '1', '--surface', 'none', ...extra]
  const output = run(args, {
    DELPHI_CLAUDE_BIN: fake,
    FAKE_STATE: 'fake-state.json',
    FAKE_LOG: 'fake-log.jsonl',
    FAKE_BOARD: boardPath,
    FAKE_REPORTS: join(lab, '.delphi', 'projects', 'demo', 'reports'),
    FAKE_TASK: 'T-001',
    FAKE_SCRIPT: JSON.stringify(script),
  })
  let dispatches = 0
  try {
    dispatches = readFileSync(join(lab, 'fake-log.jsonl'), 'utf8').split('\n').filter(Boolean).length
  } catch {
    // No dispatches at all is a valid outcome.
  }
  return { output, dispatches }
}

const cases = [
  {
    name: 'a full cycle: dev, review, done',
    script: [{ status: 'review' }, { status: 'done', report: { seat: 'reviewer', outcome: 'DONE' } }],
    expect: /1 story finished/,
    dispatches: 2,
  },
  {
    name: 'a seat reports BLOCKED',
    script: [{ report: { seat: 'dev-be', outcome: 'BLOCKED' } }],
    expect: /reported BLOCKED/,
    dispatches: 1,
  },
  {
    name: 'a seat waits on a permission prompt',
    script: [{ waiting: true }],
    expect: /is waiting for you/,
    dispatches: 1,
  },
  {
    name: 'the story never moves',
    script: [],
    expect: /handing it back/,
    dispatches: 3,
  },
  {
    name: 'the board blocks the story',
    script: [{ status: 'blocked' }],
    expect: /is blocked/,
    dispatches: 1,
  },
]

setUp()
console.log(`Lab: ${lab}\n`)

let failed = 0
for (const one of cases) {
  const { output, dispatches } = loop(one.script)
  const stopped = /Stopped: (.*)/.exec(output)?.[1] ?? '(no stop line)'
  const ok = one.expect.test(output) && dispatches === one.dispatches

  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${one.name}`)
  console.log(`      ${stopped}`)
  console.log(`      ${dispatches} dispatch(es), expected ${one.dispatches}`)
  if (!ok) failed++
}

// The guard that matters most: without --yes it must spend nothing at all.
reset()
const preview = run(['loop', '--project', 'demo', '--surface', 'none'], { DELPHI_CLAUDE_BIN: fake })
const spentNothing = !preview.includes('starting @') && preview.includes('at most 3 sessions')
console.log(`${spentNothing ? 'ok  ' : 'FAIL'}  without --yes it prints the ceiling and starts nothing`)
if (!spentNothing) failed++

console.log(failed === 0 ? '\nAll cases behaved.' : `\n${failed} case(s) did not.`)
process.exit(failed === 0 ? 0 : 1)
