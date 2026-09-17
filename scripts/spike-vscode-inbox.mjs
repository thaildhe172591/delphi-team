#!/usr/bin/env node
/**
 * Spike 6: does a Claude Code session running inside VS Code join the same world as a CLI one?
 *
 * This cannot be driven from a tool call — it needs a person to open the Claude Code panel
 * in VS Code and start a session there. So this script takes the reading before and after,
 * and prints exactly what to do in between.
 *
 * The questions, and why each one changes something:
 *
 *   1. Does a VS Code session appear in `claude agents --json` at all?
 *      If not, `dept status` can never show a seat someone is running in the editor, and
 *      the orchestrator would report it as absent rather than as unknown.
 *   2. What `kind` does it report, and does it carry an `id`?
 *      An entry with no id cannot be attached, which is what the companion extension does.
 *   3. Is its `cwd` the workspace folder?
 *      delphi joins sessions to projects by directory. A different cwd means the join fails
 *      silently and the seat looks like it belongs to no project.
 *   4. Can a CLI session and a VS Code session message each other?
 *      R16 assumes `/seat` turns an editor session into a seat the orchestrator can reach.
 *      If messages do not cross, `manual` mode is the only honest answer for that surface.
 *
 * Nothing in the companion extension depends on the answer — it reads the ledger, not
 * sessions — so this is verification, not a blocker.
 *
 * Usage:
 *   node scripts/spike-vscode-inbox.mjs before   # run first, from a terminal
 *   node scripts/spike-vscode-inbox.mjs after    # run once the VS Code session is up
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const stage = process.argv[2] ?? 'before'
const snapshot = join(tmpdir(), 'delphi-spike-vscode-before.json')

function agents() {
  try {
    const out = execFileSync('claude', ['agents', '--json'], { encoding: 'utf8', input: '' })
    return JSON.parse(out)
  } catch (error) {
    console.error('Could not run `claude agents --json`:', error.message.split('\n')[0])
    process.exit(1)
  }
}

const describe = (entry) =>
  [
    `kind=${entry.kind}`,
    `id=${entry.id ?? '(none — cannot be attached)'}`,
    `name=${entry.name ?? '-'}`,
    `state=${entry.state ?? entry.status ?? '-'}`,
    `cwd=${entry.cwd}`,
  ].join('  ')

if (stage === 'before') {
  const now = agents()
  writeFileSync(snapshot, JSON.stringify(now), 'utf8')

  console.log(`Recorded ${now.length} session(s) already running.\n`)
  console.log('Now, without closing this terminal:')
  console.log('  1. Open this repository in VS Code.')
  console.log('  2. Open the Claude Code panel and start a session there.')
  console.log('  3. In that session, type:  /status     (anything that keeps it alive)')
  console.log('  4. Come back here and run:  node scripts/spike-vscode-inbox.mjs after')
  console.log('\nThen, to answer question 4, ask the VS Code session to run:')
  console.log('     ListAgents, then SendMessage to one of the sessions it lists.')
  console.log('  Paste what it says back into the build session.')
  process.exit(0)
}

let before = []
try {
  before = JSON.parse(readFileSync(snapshot, 'utf8'))
} catch {
  console.error('No "before" snapshot. Run `node scripts/spike-vscode-inbox.mjs before` first.')
  process.exit(1)
}

const seen = new Set(before.map((entry) => `${entry.kind}:${entry.id ?? ''}:${entry.startedAt}`))
const after = agents()
const fresh = after.filter((entry) => !seen.has(`${entry.kind}:${entry.id ?? ''}:${entry.startedAt}`))

console.log(`Before: ${before.length} session(s).  After: ${after.length}.\n`)

if (fresh.length === 0) {
  console.log('ANSWER TO 1: no. The VS Code session does not appear in `claude agents --json`.')
  console.log('That makes it invisible to `dept status`, so delphi must report the editor')
  console.log('surface as unknown rather than as empty. Record it as a conflict.')
} else {
  console.log(`ANSWER TO 1: yes — ${fresh.length} new session(s):\n`)
  for (const entry of fresh) console.log(`  ${describe(entry)}`)
  console.log('\nCheck 2 and 3 against the line above: an entry with no id cannot be attached,')
  console.log('and a cwd that is not the workspace folder means delphi cannot join it to a project.')
}

const dir = mkdtempSync(join(tmpdir(), 'delphi-spike-'))
const out = join(dir, 'vscode-agents.json')
writeFileSync(out, JSON.stringify({ before, after, fresh }, null, 2), 'utf8')
console.log(`\nFull output: ${out}`)
