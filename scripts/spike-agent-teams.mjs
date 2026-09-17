#!/usr/bin/env node
/**
 * Set up the Agent Teams spike, which cannot be driven from a tool call.
 *
 * Agent Teams needs an interactive CLI session: `-p` never spawns teammates, and Claude
 * Desktop does not support teams at all. So this script builds the fixture and prints
 * exactly what to type; a person runs it and pastes the result back.
 *
 * It answers the questions Phase 0 left open, which shape how `dept up --mode teams` has
 * to be written:
 *
 *   1. Do settings-file hooks fire for teammates? (docs do not say)
 *   2. What exactly is in the TaskCreated / TaskCompleted / TeammateIdle payloads?
 *   3. Does a teammate get the model its definition asks for?
 *   4. Does effort really follow the lead rather than the definition?
 *   5. Is the shared task list there without CLAUDE_CODE_ENABLE_TODO_TOOLS?
 *   6. Does a teammate see a `skills` entry from its definition? (docs say no)
 *
 * Usage: node scripts/spike-agent-teams.mjs [directory]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.argv[2] ?? join(tmpdir(), 'delphi-teams-spike')
const log = join(root, 'hook-log.jsonl')

mkdirSync(join(root, '.claude', 'agents'), { recursive: true })
mkdirSync(join(root, '.claude', 'skills', 'spike-marker'), { recursive: true })

// A hook that records its whole stdin. Whatever the payloads really contain ends up here.
writeFileSync(
  join(root, 'record.mjs'),
  `import { appendFileSync } from 'node:fs'
const event = process.argv[2]
let raw = ''
process.stdin.on('data', (c) => { raw += c })
process.stdin.on('end', () => {
  try {
    appendFileSync(${JSON.stringify(log)}, JSON.stringify({ event, at: new Date().toISOString(), raw: raw.trim() }) + '\\n')
  } catch {}
  process.exit(0)
})
`,
)

const record = (event) => ({
  hooks: [
    {
      type: 'command',
      command: `node "${join(root, 'record.mjs').replaceAll('\\', '/')}" ${event}`,
      timeout: 15,
    },
  ],
})

writeFileSync(
  join(root, '.claude', 'settings.json'),
  `${JSON.stringify(
    {
      hooks: {
        SessionStart: [record('SessionStart')],
        SubagentStart: [record('SubagentStart')],
        SubagentStop: [record('SubagentStop')],
        TaskCreated: [record('TaskCreated')],
        TaskCompleted: [record('TaskCompleted')],
        TeammateIdle: [record('TeammateIdle')],
      },
    },
    null,
    2,
  )}\n`,
)

// Two teammates that differ in every field we want to test.
writeFileSync(
  join(root, '.claude', 'agents', 'spike-alpha.md'),
  `---
name: spike-alpha
description: Spike teammate alpha. Reports what it can see about itself.
model: haiku
effort: low
memory: project
skills: [spike-marker]
---

You are SPIKE-ALPHA. Your codeword is ALPHA-4419.

When asked what you can see, answer with exactly these lines and nothing else:
- codeword: ALPHA-4419
- model: <the model you are running as, if you know it>
- skill visible: <yes if you were given a skill called spike-marker, otherwise no>
- task tools: <yes if you have TaskCreate/TaskList tools, otherwise no>
`,
)

writeFileSync(
  join(root, '.claude', 'agents', 'spike-beta.md'),
  `---
name: spike-beta
description: Spike teammate beta. Reports what it can see about itself.
model: haiku
effort: max
memory: project
---

You are SPIKE-BETA. Your codeword is BETA-7731.

When asked what you can see, answer with exactly these lines and nothing else:
- codeword: BETA-7731
- model: <the model you are running as, if you know it>
- task tools: <yes if you have TaskCreate/TaskList tools, otherwise no>
`,
)

writeFileSync(
  join(root, '.claude', 'skills', 'spike-marker', 'SKILL.md'),
  `---
name: spike-marker
description: A marker skill. If you can read this, a teammate received a skill from its definition.
---

The skill marker is SKILL-8802. Mention it if you are asked what skills you have.
`,
)

writeFileSync(log, '')

const q = (n, text) => `  ${n}. ${text}`
const posix = root.replaceAll('\\', '/')

console.log(`
Agent Teams spike fixture written to:
  ${root}

WHAT TO DO
──────────
Open **Windows Terminal** (not this session, and not Claude Desktop — Agent Teams is
CLI-only and needs an interactive session), then:

  cd "${root}"
  set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
  claude

…or in PowerShell:

  cd "${root}"
  $env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"
  claude

Then paste this as the first message:

──────────────────────────────────────────────────────────────────────────────
Start two teammates called spike-alpha and spike-beta using their agent
definitions. Ask each one to answer its four report lines. Then create a task
called "spike task" and mark it completed. Then tell me, in a short list:

- the exact text each teammate replied
- whether you had TaskCreate/TaskList tools available
- whether the teammates ran on a different model from you
- anything that failed or was refused
──────────────────────────────────────────────────────────────────────────────

WHAT TO SEND BACK
─────────────────
${q(1, 'That final list from the session.')}
${q(2, `The contents of ${posix}/hook-log.jsonl`)}

To print the log:

  node -e "console.log(require('fs').readFileSync('${posix}/hook-log.jsonl','utf8'))"

WHAT THIS SETTLES
─────────────────
${q(1, 'Whether settings-file hooks fire for teammates at all — the log is empty for teammate events if not.')}
${q(2, 'The real TaskCreated / TaskCompleted / TeammateIdle payload fields.')}
${q(3, 'Whether a teammate honours the model in its definition.')}
${q(4, 'Whether effort follows the lead: alpha asks for low, beta asks for max.')}
${q(5, 'Whether the shared task list exists without CLAUDE_CODE_ENABLE_TODO_TOOLS.')}
${q(6, 'Whether a teammate receives a skill from its definition — the docs say no.')}

Nothing here writes outside that directory, and it can be deleted afterwards.
`)
