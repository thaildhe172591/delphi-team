# delphi-team

**English** · [Tiếng Việt](./README.vi.md)

**Run Claude Code as a department.** One orchestrator you talk to, and specialist seats — BA, PM,
tech lead, backend, frontend, DB, QA, tester, reviewer — each with its own role, memory and file
scope.

> Unofficial. Works with Claude Code; not affiliated with or endorsed by Anthropic.

> **Pre-alpha.** It works and it is tested, but the command surface may still change.

---

## The problem

Working across several Claude Code sessions, one per role, **the role is the fragile part.** It lives
in a prompt you retype for every new session, and it evaporates on resume, on `/clear`, on
compaction, or when a session is renamed. So you end up being the messenger between your own
sessions, re-explaining context that a file should have held.

## The idea

**A seat outlives the session that fills it.**

- Identity, scope and rules live in a generated agent definition, not in a prompt you retype.
- Work state lives in a project ledger on disk — brief, state, journal, decisions, board, stories,
  reports.
- The conversation is disposable. Tomorrow's session reads the ledger and carries on.
- You talk to the orchestrator. It forms the department, hands out the work, and brings you
  decisions.

It is built on what Claude Code already ships — agent definitions, background sessions, hooks,
skills, plugins — rather than reimplementing any of it.

---

## Install

**Requires** Node.js 22 or newer, and [Claude Code](https://claude.com/claude-code) on your PATH and
signed in.

```bash
npm install -g delphi-team
```

<details>
<summary>pnpm, or without Node at all</summary>

```bash
pnpm add -g delphi-team
```

There is also a PyPI package carrying a standalone binary, for machines with no Node:

```bash
pipx install delphi-team
```

</details>

Check it:

```bash
delphi --version
claude --version      # must be installed and signed in
```

The CLI installs as both `delphi` and `delphi-team`.

> **`delphi` must be on your PATH, not merely built.** The hooks delphi installs into a project call
> `delphi hook <event>` by name. Without it on PATH they fail open and silently do nothing, which
> looks exactly like working.

---

## Five minutes

### 1. Set a project up

delphi needs a git repository — it refuses to initialise outside one.

```bash
cd your-project
delphi init --yes
delphi doctor
```

`init` writes:

| | |
|---|---|
| `.delphi/` | config, protocol, roles, teams, capabilities |
| `.claude/agents/*.md` | one agent definition per seat — this is what Claude Code loads |
| `.claude/settings.json` | four hooks: SessionStart, PreCompact, PreToolUse, SubagentStop |
| `CLAUDE.md` | imports `.delphi/PROTOCOL.md`, so every session in the project loads the protocol |
| `.gitattributes` | pins the ledger to LF, so git does not report it as wholly changed on Windows |

`init` never overwrites a file you own without `--force`, and `--dry-run` shows what it would change.

### 2. Pick a department

```bash
delphi pack list
delphi pack show solo-dev           # what it is for, and what it would change here
delphi pack apply solo-dev          # prints the diff, writes nothing
delphi pack apply solo-dev --write
delphi role build --all
```

| Pack | For |
|---|---|
| `solo-dev` | You are the whole team |
| `software-team` | A product with a roadmap and a schema that changes |
| `content-team` | Work whose output is prose |

Then edit `owns` for each seat in `.delphi/config.yaml`. That list of globs is what stops two seats
being dispatched onto the same file.

### 3. Make some work

```bash
delphi project new shop --title "Order checkout"
delphi story new T-001 --title "Add a health endpoint" --owner dev-be --project shop
```

Open `.delphi/projects/shop/stories/T-001.md` and fill in four fields. The board refuses `ready`
without them:

```yaml
files: ["src/health.ts"]                  # globs this story owns
deliverables: ["a GET /health route"]
acceptance: ["GET /health returns 200"]   # statements someone could check
verify: "npm test"                        # the command that proves it
```

```bash
delphi task move T-001 ready --project shop
delphi next
```

### 4. Talk to the orchestrator

```bash
claude
```

That session loads `CLAUDE.md` → `.delphi/PROTOCOL.md`, and the SessionStart hook injects the current
state and board. Say what you want done. It forms the department, writes the stories and dispatches
the seats.

---

## What everything does

Commands are marked **🟢 free** or **🔴 spends quota**. Nothing marked 🟢 ever starts a Claude
session. Every command takes `--json`.

### Setting up 🟢

| Command | |
|---|---|
| `delphi init` | Set a project up as a department |
| `delphi doctor` | Check the setup is sound, and score it |
| `delphi upgrade` | Bring generated files up to date with this version of delphi |

### Seats and teams 🟢

| Command | |
|---|---|
| `delphi role list` | The seats that exist, and what each is made of |
| `delphi role build [seat] \| --all` | Regenerate a seat from its base role and capabilities |
| `delphi role add/remove <seat>` | Give a seat a capability, or take one away |
| `delphi capability list` | The 8 capability packs that ship, and what each needs |
| `delphi capability new <id>` | Start a capability of your own |
| `delphi team list` | The 6 team templates |
| `delphi pack list \| show \| apply` | Ready-made departments |

A **seat** is a base role plus capability packs plus what it owns. A **capability** is something a
seat can also do — `pythia-oracle` does not deserve a seat, it deserves to be a thing the backend
developer can also do.

### The ledger 🟢

| Command | |
|---|---|
| `delphi project new/list/open/close` | Projects this department works on |
| `delphi state` | The current snapshot: goal, phase, what is in flight, what is blocked |
| `delphi journal add/tail` | The event log — append only |
| `delphi task list/move/show` | The board |
| `delphi story new <id>` | A handover package for one piece of work |
| `delphi report <seat> <id> <outcome>` | Write a report and print the message for the orchestrator |
| `delphi checkpoint` | Save a restore point |
| `delphi resume [slug]` | Everything a new orchestrator needs to pick up where the last one stopped |

**The board refuses illegal moves.** `ready` needs acceptance criteria and a file list, `done` needs
a report with evidence, `blocked` needs a reason. Two stories claiming the same file are refused
before either seat starts.

### Running a department

| Command | | |
|---|---|---|
| `delphi dept up --dry-run` | 🟢 | Who would start, why, and the exact prompt each would get |
| `delphi dept up` | 🔴 | Start them |
| `delphi dept status` | 🟢 | Who is working, who is stuck, what is waiting |
| `delphi dept down` | 🟢 | Stop the seats this project started |
| `delphi dispatch <seat> <id>` | 🔴 | One seat, one story, in the background |
| `delphi start <seat>` | 🔴 | Open a seat session in this terminal |
| `delphi seat <seat>` | 🟢 | The package a seat needs to start, for pasting into Claude Desktop |
| `delphi meeting <seats...>` | 🟢 | Prompts to put several seats on one question |
| `delphi loop` | 🔴 | Run a story through dev and review on its own |

Both `dept up` and `dispatch` run the same pre-flight: two seats owning one path, two stories
claiming one file, a story with no acceptance criteria — each blocks the dispatch. Both ask before
spending, unless you pass `-y` or the terminal cannot be asked.

### Watching 🟢

| Command | |
|---|---|
| `delphi watch` | The board and the live seats, side by side |
| `delphi watch --follow` | Redraws |
| `delphi watch --web` | The same view in a browser on `127.0.0.1:4173` |
| `delphi cost` | Sessions delphi has started — not your account spend, and it says so |

`--web` is read-only: `GET` only, no endpoint writes, bound to 127.0.0.1, and it checks the `Host`
header — a page in your browser can otherwise point a hostname it controls at localhost and read
the whole ledger.

### Between seats 🟢

| Command | |
|---|---|
| `delphi handoff new/list` | A handover note: the part that is not in any file |
| `delphi inbox [seat]` | Messages waiting for a seat |
| `delphi next` | What to pick up now |
| `delphi shift end` | Close the shift: checkpoint, then stop the seats |
| `delphi memory show/compact <seat>` | What a seat remembers between sessions |

### Advanced 🟢

| Command | |
|---|---|
| `delphi worktree create/remove <seat>` | An isolated git checkout per seat |
| `delphi export plugin` | Generate a Claude Code plugin from the templates |
| `delphi import bmad` | Map BMAD-METHOD artifacts onto a delphi ledger |
| `delphi snap` | Save the clipboard image into the project assets |
| `delphi mcp` | Run the delphi MCP server on stdin and stdout |

`delphi mcp` gives a seat eight ledger tools to call instead of typing shell commands — same core,
same file locks, same refusals, different door:

```bash
claude mcp add delphi --scope project -- delphi mcp
```

It will show as **pending approval**, which is correct: a project-scoped `.mcp.json` is a file
anyone could commit.

---

## `delphi loop` — read this before using it

The only command that starts sessions on its own.

```bash
delphi loop                 # prints the ceiling and the first prompt, spends nothing
delphi loop --yes           # runs
```

| Guard | Default |
|---|---|
| `--max-stories` | 1 |
| `--max-attempts` | 3 dispatches per story |
| `--step-timeout` | 20 minutes per seat |

`--max-stories × --max-attempts` is the most `claude` runs one invocation can ever start, and that
bound is tested rather than asserted. It stops on its own when a seat reports BLOCKED, DECISION or
RISK, when a seat waits on a permission prompt, when the board blocks the story, or when a story
stops moving.

---

## Configuration

Everything lives in `.delphi/config.yaml`, which is yours — delphi never rewrites it without a flag,
a dry run and a diff.

```yaml
language: en                     # the language seats answer you in

defaults:
  team: feature

dispatch:
  mode: auto                     # auto | teams | sessions | manual
  surface: auto                  # auto | wt | tmux | vscode | desktop | none
  max_active: 5                  # three to five seats coordinate well; more do not
  confirm_before_dispatch: true

models:
  orchestrator: { model: fable, effort: high }
  dev-be: { model: opus, effort: xhigh }

seats:
  dev-be:
    base: dev-be
    capabilities: [db-engineer, pythia-oracle]
    owns: ["src/api/**", "db/**"]

safety:
  db_default: read-only
  allow_production: false
```

`surface: auto` splits the terminal you are already in: tmux inside tmux, the companion extension
inside VS Code, the current Windows Terminal window otherwise. You keep your pane, the seats stack
beside it.

---

## Safety

These are not defaults you can turn off by accident. They are the design.

- **Never** `--dangerously-skip-permissions`, and delphi will not suggest it as a workaround.
- **No `postinstall`, no telemetry.** Nothing runs at install time and nothing phones home.
- **Your config is yours.** No overwrite without an explicit flag, a dry run and a diff.
- **Database access is read-only by default.** A write needs a script, a named environment, a
  rollback and your approval, in that order.
- **The orchestrator cannot edit source.** A hook keeps it in the ledger and the docs, because an
  orchestrator that starts editing code stops coordinating.
- **No shell, ever.** Arguments are passed as arguments, so a path with a space or a non-ASCII
  character is not a problem.
- **`watch --web` serves `GET` only**, binds to 127.0.0.1, and checks the `Host` header.
- **Secrets are never printed** — not in chat, not in a report, not in a file.

---

## When something does not work

| | |
|---|---|
| `error: not inside a project` | You are outside a git repository, or have not run `delphi init` |
| A dispatch fails mentioning a line break and `cmd.exe` | Update — the adapter resolves the Windows `.cmd` shim to its real `.exe` |
| `claude` is not on PATH | Set `DELPHI_CLAUDE_BIN` to its full path |
| Hooks seem to do nothing | `delphi` is not on PATH. Hooks fail open, so this looks like working |
| A pane opens but cannot launch | Same as the `.cmd` shim above; update |
| Every command is slow the first time | It is asking `claude agents --json` what is running |

Everything delphi does to the ledger is a file. If a command surprises you, look at
`.delphi/projects/<slug>/` — the board, the journal and the reports are plain text, and they are the
truth.

---

## Links

- [Guide](https://github.com/thaildhe172591/delphi-team/blob/main/docs/guide.md)
- [Documentation](https://github.com/thaildhe172591/delphi-team/tree/main/docs)
- [Trying it, step by step](https://github.com/thaildhe172591/delphi-team/blob/main/docs/try-it.md)
- [Writing a role or a capability](https://github.com/thaildhe172591/delphi-team/blob/main/docs/writing-a-role.md)
- [Issues](https://github.com/thaildhe172591/delphi-team/issues)

MIT. Unofficial; works with Claude Code.
