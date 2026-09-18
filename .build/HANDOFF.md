# HANDOFF — read this first

You are picking up a build in progress on a different machine from the one that started it.
This file is the whole context. Read it, then `.build/STATE.md` for where the build stands.

Written 2026-09-17, at the end of Phase 5, after running a real department on a real project.

---

## 1. What is being built

**delphi-team**: a harness that makes Claude Code work like a department. One orchestrator the
user talks to, and specialist seats — BA, PM, tech lead, dev-be, dev-fe, DB, QA, tester,
reviewer — each with its own role definition, memory and file scope.

The idea it is built on: **a seat outlives the session that fills it.** Identity lives in a
generated agent definition, not a prompt someone retypes. Work state lives in a ledger on disk.
The conversation is disposable; tomorrow's session reads the ledger and carries on.

It ships on npm and PyPI, and is Windows-first.

## 2. Who decides what

| Source | Authority |
|---|---|
| `docs/spec/*.md` (9 files, Vietnamese) | **The contract.** Nine specs the owner wrote. They decide the design. |
| `docs/spec/BUILD_PROMPT.md` | **The execution prompt.** Phases 0–7, and the rules below. |
| `.build/` | **The build's own memory.** STATE, JOURNAL, DECISIONS, CONFLICTS, VERIFY. |
| The owner, in chat | Overrides all of the above. Amendments get recorded in CONFLICTS §D. |

When the spec and reality disagree, **reality wins and the disagreement gets written down** as a
`C-0nn` row in `.build/CONFLICTS.md`. Seventeen of those exist. Do not silently build what the
spec describes when the tool does something else — that is how a feature ships doing nothing.

## 3. Rules that are not yours to change

From BUILD_PROMPT and the owner, in force for every session:

- **Mandatory stop points.** Stop and ask before: starting a new phase, any publish, creating a
  public repo, renaming the package, changing the licence, adding a non-permissive dependency,
  using a token or secret, or changing an architectural decision already recorded in the spec.
- **Never** `--dangerously-skip-permissions` or `bypassPermissions`, not even "to make it smooth".
- **No `postinstall`. No telemetry.** Never overwrite a user's config without an explicit flag,
  a dry run and a diff.
- **Never print secrets** — not in chat, not in a report, not in a file.
- **Never open `connections.json`** (Pythia holds passwords there). Use `pythia connections`.
- **Copy nothing** from BMAD-METHOD, ruflo or any other project — no prompts, no templates, no
  code. Do not use "Claude", "Anthropic" or "BMAD" in package names.
- **Do not invent Claude Code behaviour.** Verify against the installed version and the official
  docs, or record it UNVERIFIED with a fallback. Every capability relied on has a source in
  `docs/research/claude-code-capabilities.md`.
- Answer the owner in **Vietnamese** (`language: vi` in `.delphi/config.yaml`). Code, comments and
  commits stay in English.

## 4. Where the build is

**Phases 0–6 done. Phase 7 is release, and publishing is a mandatory stop point.**

```
Phase 0  verification spikes            done
Phase 1  repository, CI, packaging      done
Phase 2  core, templates, CLI, hooks    done
Phase 3  dispatch, surfaces, teams      done
Phase 4  advanced management            done
Phase 5  loop, MCP server, VS Code ext  done
Phase 6  watch --web, docs, packs       done   <- you are here
Phase 7  release                        NOT STARTED, publish = stop point
```

Phase 7 is PACKAGING_SPEC section 6: the npm and PyPI release. Nothing is published without the
owner saying so, in this conversation, for that specific publish.

### Carried debt

0. **`dispatch.confirm_before_dispatch` is a lie.** Declared in `packages/core/src/schema/config.ts`,
   defaults to `true`, appears in the shipped config — and nothing reads it. The config promises a
   confirmation before spending quota that does not exist. It is in the spec (CUSTOMIZATION_SPEC §188), so
   implement it or amend the spec; both need the owner. If implemented it must only prompt when
   `process.stdout.isTTY` — the orchestrator runs `dept up` through the Bash tool in a non-interactive
   session, and a prompt there would hang the department.
1. `packages/cli` has **no README**, so the npm page would be blank. Needed before any publish.
2. `delphi cost` counts sessions, not money, and says so in its own output. Whether to keep it at
   all is the owner's call at release (C-009).
3. **Spike 6** — whether a VS Code session joins the cross-session world — needs the owner to run
   `node scripts/spike-vscode-inbox.mjs`, because it needs a Claude Code session started *inside*
   VS Code and no tool call can do that. Nothing built depends on the answer.

## 5. The machine you need

| Tool | Version used | Notes |
|---|---|---|
| Node | 22.16.0 | floor is `>=22` (ADR-0009); execa 10 and commander 15 both require it |
| pnpm | 10.33.2 | workspace monorepo; `corepack enable` is enough |
| Claude Code | 2.1.274 | must be logged in: `claude auth login` |
| git | any | delphi refuses to initialise outside a repository |
| bun | 1.4.2 | only for `scripts/build-binaries.mjs` (the PyPI wheel) |
| Python + pipx | 3.14 / 1.17 | only for the PyPI side |

```bash
corepack enable && pnpm install && pnpm check
```

`pnpm check` is `lint → build → typecheck → test`, **in that order and for a reason**: typecheck
before build passes locally off a stale `dist/` and then fails on a clean CI checkout.

## 6. Traps already paid for

Every one of these cost a debugging session. They are listed so they cost you nothing.

### Tooling

- **Bash heredocs in the Claude Code environment mangle apostrophes and backslashes.** Writing a
  file with `cat <<'EOF'` silently corrupts `\n`, `\\` and `'`. **Use the Write tool.** This has
  bitten three times, most recently producing a path with a literal newline in it that made a
  probe report `exists: false` for a file that existed.
- **Python patch scripts:** escape sequences in the *replacement* string become real characters —
  `\r\n` becomes a line break, `\\/` becomes `\/`. Always `assert old in s` before replacing, and
  pass `newline='\n'` to `write_text` or Windows writes CRLF into files `.gitattributes` says are LF.
- **`pnpm check` order** — see above.

### Things the code now guards, so you understand why it looks like that

- **`ClaudeAdapter` resolves a Windows `.cmd` shim to the `.exe` it names** (C-017). Do not
  "simplify" this away. `claude` on PATH is an npm shim; a `.cmd` runs through `cmd.exe`, which
  treats a line break as a command separator with no escape, so execa refuses to pass one — and
  every spawn prompt delphi sends is multi-line. Without this, **every** background dispatch fails
  on Windows: `dept up`, `dispatch`, `meeting`, `loop`.
- **The ledger write path holds an in-process promise queue on top of the file lock** (ADR-0008).
  A retry-based lock has no fairness and starves writers; raising the retry count only moves the
  threshold. A concurrency test found this twice.
- **`commander`'s `.command()` returns the *subcommand*.** Hold the parent in a variable and
  return that, or the parent is never registered and its children leak to the top level. There is
  a command-tree guard test.
- **`@delphi-team/core` is a `devDependency` of the CLI** (ADR-0007), bundled by tsup. In
  `dependencies` it makes an unpublishable tarball. There is a guard test.
- **The CLI declares core's runtime deps itself** so tsup externalises them. `proper-lockfile` is
  CommonJS; bundled into ESM it dies on its first `require`. There is a drift guard test.
- **YAML turns an unquoted ISO timestamp into a `Date`**, so `TimestampSchema` accepts both. And a
  bare `key:` is `null`, which a zod `.optional()` rejects rather than treating as absent — story
  frontmatter is cleaned of nulls before parsing.
- **`resolve()`, not `join()`**, for a user-supplied `--out` path.
- **Tests that fake Windows must use lower-case `PATHEXT`**, or they find nothing on Linux CI and
  pass for the wrong reason.

### Found by running a department live

The whole of this list came from one afternoon of actually using it, and none of it had a failing test:

- **A seat that finished blocked the department.** A background session that completed its turn sits at
  `state: blocked, status: idle`. It is not `done` — that only happens once it is stopped. The active-limit
  filter was `state !== 'done'`, so every seat that had ever run still counted against the limit and the
  next story could never start. `isWorking()` in `packages/cli/src/commands/dept.ts` is that fix; do not
  loosen it back to "not done".
- **Windows Terminal cannot launch a bare `claude`.** It starts the pane command itself and does not resolve
  PATHEXT, so the npm `.cmd` shim fails with `0x80070002` in a pane you then close by hand. Panes launch the
  resolved `.exe` via `claudeBinary()`. Same root as C-017, one layer out.
- **`existsSync` is the wrong probe for a Store-installed executable.** `wt.exe` is an app execution alias —
  a reparse point Node cannot stat, so `existsSync`, `lstatSync` and even `readdirSync` on its directory all
  say ENOENT for a program `where` finds and the shell runs. `resolveSurface` deliberately does not probe.
- **`watch` treated every background session on the machine as a seat**, and **read the journal template's
  own format line as an event**. Both fixed; both had looked right on the page for weeks.
- **A team can name a seat the project never built**, and `dept up` held it in silence, so the review step
  went missing without anyone noticing.
- **`delphi dispatch` ran no pre-flight at all.** Every check lived inside `planDepartment`, which only
  `dept up` called, so two stories claiming one file were both dispatched and one seat deleted the other's
  uncommitted work. `checkStories()` is shared now; do not move it back inside the planner (C-018).

### The largest finding

**Agent Teams does not work the way the spec assumed.** With
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, a team was created with **only the lead as a member**;
the named agents ran as background **subagents**; `TaskCreated`/`TaskCompleted`/`TeammateIdle`
**never fired**; the task tools were **absent entirely** (C-015).

So delphi installs a **`SubagentStop`** hook — the event that actually arrives, carrying
`last_assistant_message` — and depends on nothing native. `board.yaml` was always the source of
truth. A subagent *does* receive `skills` from its frontmatter, unlike a teammate (C-016).

**The lesson that generalises: running the thing finds what reading it cannot.** Six defects in
Phase 2c alone came from execution, not review. Do not mark work done on a reading.

## 7. How to prove the thing works

```bash
pnpm check                      # lint, build, typecheck, 384 tests
node scripts/loop-lab.mjs       # the loop end to end, for free
node packages/cli/dist/index.js doctor
```

To install it the way it will actually ship, which also checks the published artifact:

```bash
cd packages/cli && npm pack && npm install -g ./delphi-team-0.1.0.tgz
```

**delphi has to be on PATH**, not just built: the `settings.json` that `delphi init` writes calls a bare
`delphi hook <event>`. Without it the hooks fail open and silently do nothing, which looks exactly like
working.

`scripts/loop-lab.mjs` builds a scratch project in a temp directory and runs `delphi loop`
against `scripts/fake-claude.mjs` — a stand-in binary — through five stop conditions plus the
"without `--yes` it spends nothing" guard. **Use it instead of spending quota.** It is also the
pattern to copy for anything else that would otherwise cost money to test.

`docs/try-it.md` is the hands-on guide: what to run, and which commands cost quota.

## 8. Shape of the repository

```
packages/core       schemas · role composition · locked ledger · claude adapter · embedded
                    templates · init planning · doctor · dispatch · loop state machine · MCP protocol
packages/cli        32 commands, all with --json; the hook entry point; the MCP server
packages/templates  49 files: roles, capabilities, teams, skills, PROTOCOL.md, ledger templates
packages/vscode     the companion extension (private; marketplace is Phase 7)
python/             hatchling wheel carrying a compiled binary; fails loudly off-platform (ADR-0005)
scripts/            sync-version · build-binaries · build-templates · spikes · loop-lab · fake-claude
.build/             this build's memory
.delphi/            delphi running on itself, with the remaining phases on its own board
docs/spec/          the nine specs — the contract
docs/research/      what was verified about Claude Code, with sources
```

Templates are compiled into a generated TypeScript module (`packages/core/src/templates/
files.generated.ts`) by `scripts/build-templates.mjs`. **Edit the files under
`packages/templates/files/`, never the generated module.** CI fails if they drift.

## 9. Starting a session on this

There is no ceremony. Read this file, read `.build/STATE.md`, run `pnpm check`, and ask the owner
which phase to work on. `.delphi/` holds delphi's own board, so `delphi task list` shows the
remaining phases as tasks.

If you are about to do something on the stop-point list in §3 — stop and ask.
