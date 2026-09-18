# Guide

**English** · [Tiếng Việt](./guide.vi.md)

How delphi actually works, and how to work with it. The command reference is in the
[package README](../packages/cli/README.md); this is the part that explains why the commands are
shaped the way they are.

---

## 1. The mental model

### A seat is not a session

A **session** is a conversation with Claude Code. It ends, it gets cleared, it gets compacted, it
gets renamed. A **seat** is a position in a department — "the backend developer on this project" —
and it survives all of that.

The difference matters because everything that makes a session useful is exactly what a session
cannot keep:

| | Lives in a session | Lives in a seat |
|---|---|---|
| Who you are | a prompt you retype | `.claude/agents/dev-be.md` |
| What you may touch | whatever you remember | `owns` in the config, `files` in the story |
| What you learned | the transcript | `knowledge/dev-be.md` |
| What is left to do | scrollback | `board.yaml` |

### The ledger is the truth

Everything that must survive is a file under `.delphi/projects/<slug>/`:

```
BRIEF.md        why this project exists          (you write it, once)
STATE.md        the snapshot: goal, phase, in flight, blocked
JOURNAL.md      append-only event log            (never edited, only added to)
DECISIONS.md    ADRs: context, decision, consequences
board.yaml      every task, its status and owner
stories/*.md    one handover package per piece of work
reports/*/*.md  what each seat did, with evidence
knowledge/*.md  what each seat learned, between sessions
handoffs/*.md   the part that is not in any file
inbox/*/        messages waiting for a seat
sessions.log    what delphi started, and with which model
```

When the ledger and a conversation disagree, the ledger wins. That is not a rule about trust; it is
the only one of the two that is still there tomorrow.

### The orchestrator is the only seat you talk to

You describe what you want. It writes the stories, forms the department, dispatches the seats,
collects their reports and brings you the decisions. It does not write code — a hook enforces that,
because an orchestrator that starts editing files stops coordinating and fills its context with
detail nobody else can see.

---

## 2. Anatomy of a seat

A seat is composed, not written:

```
base role  +  capability packs  +  what it owns  =  .claude/agents/<seat>.md
```

```yaml
# .delphi/config.yaml
seats:
  dev-be:
    base: dev-be                              # roles/dev-be.md
    capabilities: [db-engineer, pythia-oracle] # merged in at build time
    owns: ["src/api/**", "db/**"]
    description: "Backend and Oracle: APIs, procedures, queries."
```

`delphi role build --all` regenerates them. The generated file has marked blocks:

```markdown
<!-- delphi:core:start -->        ← the base role. Regenerated. Do not edit.
<!-- delphi:capabilities:start --> ← merged capabilities. Regenerated.
<!-- delphi:project:start -->      ← yours. Never touched by an upgrade.
```

Write project-specific instructions in the project block and they survive every `delphi upgrade`.

### Roles versus capabilities

A **role** deserves a seat: it has its own identity, its own definition of done, its own report. A
**capability** does not — it is a thing some seat can *also* do.

`pythia-oracle` is a capability, not a role. Oracle work does not need its own session sitting idle;
it needs the backend developer to know the safety rules when the story touches the database.

---

## 3. A story is a contract

Four fields decide whether a story can be dispatched at all:

```yaml
files: ["src/server.js", "src/health.test.js"]
deliverables: ["a GET /health route", "a test that covers it"]
acceptance:
  - "GET /health returns 200 with content-type application/json"
  - "the existing GET /orders route still returns its array"
verify: "npm test"
```

- **`files`** is the ownership contract. It is what lets two seats work at the same time. Two stories
  claiming one path are refused before either seat starts — this is checked by `dept up` *and* by
  `dispatch`, because a single-seat dispatch is still a dispatch.
- **`acceptance`** is how a seat knows it is finished. Without it, "done" means "I stopped".
- **`verify`** is how it proves that. A report saying "tests pass" with no output is a claim, not
  evidence.

The board refuses illegal moves:

| Move | Refused unless |
|---|---|
| → `ready` | the story has acceptance criteria and a file list |
| → `done` | a report exists carrying the verify command's output |
| → `blocked` | a reason is given |
| `ready` → `done` | not allowed at all; work goes through `doing` |

---

## 4. A shift, end to end

```bash
# morning
delphi resume                       # what a new orchestrator needs to pick up
claude                              # talk to the orchestrator

# it writes stories, then:
delphi dept up --dry-run            # who would start, and the exact prompt each gets
delphi dept up                      # start them — asks first

# while they work
delphi watch --follow               # or --web for a browser
delphi dept status                  # who is stuck, and how to reach them

# when a seat finishes
delphi task show T-001              # the story and its state
cat .delphi/projects/shop/reports/dev-be/T-001-1.md

# end of day
delphi shift end                    # checkpoint, then stop the seats
delphi dept down
```

### What each seat does on its own

Every seat follows `.delphi/PROTOCOL.md`, which every session in the project loads because
`CLAUDE.md` imports it — and an import survives compaction, which a pasted prompt does not.

The protocol is twelve short sections. The ones that do the work:

1. **You are a seat.** Work out which one from the agent definition, `DELPHI_SEAT`, or the `/delphi-seat`
   skill. **If none of those says, ask — do not guess.** Answering as the wrong seat corrupts the
   ledger.
2. **Files are the truth.** Anything that must survive goes in a file.
3. **Stay inside your file scope.** Something outside it needs changing? Message the seat that owns
   it. *Deleting is editing, and it is the one that cannot be undone.*
4. **Write through the commands**, so the files stay locked and valid.
5. **Report in the contract's shape** — at most fifteen lines to the orchestrator, the detail in a
   file.
7. **Prove it before you call it done.** Run the verify command, paste the trimmed output.

---

## 5. How work gets dispatched

`delphi dept up` picks a mode from the environment rather than a setting:

| Mode | When | What it does |
|---|---|---|
| `sessions` | `claude --bg` can be launched | One background session per seat. The normal case |
| `teams` | interactive CLI, experiment enabled, no seat needs its own effort | Agent Teams |
| `manual` | anything else, including Claude Desktop | Prints the prompt for you to paste |

> **About `teams`:** a live spike found that with the experiment enabled, a team was created with
> only the lead as a member, the named agents ran as background subagents, the team events never
> fired, and the task tools were absent. delphi therefore depends on none of it — `board.yaml` is the
> shared task list, and it always was. See `.build/CONFLICTS.md` C-015.

### Seeing them work

`dispatch.surface: auto` splits the terminal you are already in:

| You are in | It uses |
|---|---|
| tmux | `tmux split-window`, laid out `main-vertical` |
| the VS Code terminal | nothing — the companion extension opens the panes |
| anything else on Windows | `wt -w 0 split-pane` |

You keep your own pane; the seats stack down the side. Set `surface: none` to leave them in the
background, where `claude attach <id>` still reaches them.

---

## 6. Memory, and why sessions are disposable

Three layers, and they are different on purpose:

| Layer | Where | Survives |
|---|---|---|
| The conversation | the session | until it is cleared or compacted |
| Seat knowledge | `knowledge/<seat>.md` | forever, and is read at startup |
| Project state | the ledger | forever, and is what `resume` rebuilds from |

**Open a new session tomorrow rather than continuing yesterday's.** A long session degrades: it
compacts, it loses the middle, and it carries assumptions nobody can see any more. `delphi resume`
rebuilds the situation from files in a fraction of the context — and what it rebuilds is checkable,
because it is on disk.

`delphi memory compact <seat>` moves overflow into an archive. Claude Code preloads only the first
200 lines or 25 KB of a memory file, so one that grows past that silently loses its own beginning.

---

## 7. The automation loop

`delphi loop` is the only command that starts sessions on its own, and it is built to stop.

```
        ┌─ story ready ─→ dispatch owner ─→ wait ─→ read the board ─┐
        │                                                           │
        └──────────── under every limit? ←──────────────────────────┘
                              │ no
                              ↓
                            stop
```

It stops when:

- `--max-stories` (default **1**) have finished
- one story has cost `--max-attempts` (default **3**) dispatches
- a seat reports **BLOCKED**, **DECISION** or **RISK** — those are a seat asking for a person
- a seat is waiting on a permission prompt
- the board blocks or cancels the story
- a seat has not finished within `--step-timeout` (default 20 minutes)

Run it without `--yes` first. It prints the ceiling in sessions, the first seat it would start, and
the exact prompt — and spends nothing.

---

## 8. Safety, and what it costs you

Every one of these makes something slower, and each is deliberate.

| Rule | What it costs | Why |
|---|---|---|
| No bypassed permissions | you approve things | the permission system is what protects you; a harness that turns it off is a harness that decides for you |
| Config is never overwritten | a flag and a diff | your settings are yours, and a silent overwrite is indistinguishable from a bug |
| DB is read-only by default | a script and an approval for writes | the alternative is a migration nobody reviewed |
| Orchestrator cannot edit source | a story and a dispatch | an orchestrator that edits stops coordinating |
| `loop` needs `--yes` | a second command | it spends real quota, and the first command is where you find out how much |
| `watch --web` is localhost-only | no sharing the dashboard | the board names people, blockers and paths |

---

## 9. When it goes wrong

The ledger is plain text, so the answer is usually in it.

```bash
delphi doctor                       # is the setup sound
delphi dept status                  # is a seat stuck on a permission prompt
delphi journal tail                 # what actually happened, in order
cat .delphi/projects/<slug>/reports/<seat>/<id>-1.md
```

**A seat stuck on a permission prompt** is the failure that wastes a whole shift, because nothing
looks wrong. `dept status` and `watch` both surface it, and tell you the `claude attach` line.

**A story that keeps coming back** usually has vague acceptance criteria. If a seat cannot tell
whether it is finished, neither can the reviewer.

**Two seats colliding** means the `owns` globs or the story `files` overlap. delphi refuses the
collisions it can see before dispatch — the ones it cannot see are shell commands, and for work where
that must be impossible rather than merely refused, `delphi worktree` gives each seat its own
checkout.
