# BUILD STATE

Updated: 2026-09-17 evening · **Phase 5 (Automation) — DONE, and run live.** Waiting on the owner to approve Phase 6.

## Current phase
Phases 0 to 3 complete. The repository is public, CI runs on every push, and delphi is set up on itself.

Phase 3 settled two things that were open since Phase 0, both by the owner running them:
- **Agent Teams**: a team is created with only the lead as a member; named agents run as background
  subagents, the three team hooks never fire, and the task tools do not exist. delphi uses `SubagentStop`,
  which does fire and carries the seat's closing line. Nothing depends on the native task list. (C-015)
- **`wt -w 0 split-pane`**: confirmed to open in the current window, so `--surface wt` runs it.

## Environment
| Tool | Version |
|---|---|
| Claude Code | 2.1.274 |
| Node / npm / pnpm | 22.16.0 / 10.9.2 / 10.33.2 |
| git | 2.54.0.windows.1 |
| Python / uv / pipx | 3.14.6 / 0.11.23 / 1.17.3 |
| bun | 1.4.2 |
| Pythia | `pythia-plsql` 0.14.2 |
| OS | Windows 11 Pro 22621 |

## Stack
TypeScript 7.0.2 strict + ESM · vitest 5 · biome 2.5 · changesets 3 · commander 15 · tsup 8.5 (CLI only) ·
zod 4 · execa 10 · yaml 2 · gray-matter 4 · proper-lockfile 4 · hatchling 1.32 · bun 1.4.
Node floor `>=22` since ADR-0009.

## What exists
```
packages/core       schemas · role composition · locked ledger · claude adapter ·
                    embedded templates · init planning · doctor checks
packages/cli        32 commands, all with --json; the hook entry point; the MCP server
packages/vscode     delphi-team-vscode: the board in the status bar, one editor terminal
                    per running seat, driven entirely by the ledger
packages/templates  43 files: 15 roles, 8 capabilities, 5 teams, 6 skills,
                    PROTOCOL.md, 9 ledger and 4 artifact templates, sample config
python/             hatchling wheel carrying a compiled binary, no npx fallback
scripts/            sync-version · build-binaries · build-templates
.github/            ci.yml (5 jobs) · install-matrix.yml · issue and PR templates
.delphi/            delphi running on itself, with the remaining phases on its own board
```

## Measured, not assumed
- **357 tests pass**, and the CLI is installed from its own npm tarball rather than a link, so the published
  artifact is what was exercised: 80 KB, four files, core bundled, dependencies resolve.
- **A real department ran on a real project.** dev-be took a story from `ready` to `review` with `npm test`
  green, filed a report, handed over. The orchestrator drove it from a `claude` session and reported two
  defects in delphi itself while doing so.
- `packages/core` coverage was 92/85/94/93 at the end of 2a and has grown since.
- The MCP server was checked three ways: unit tests, a real JSON-RPC exchange over stdio, and registration
  through `claude mcp add`, which correctly held the project-scoped server as pending approval.
- `delphi loop` cannot start more than `--max-stories x --max-attempts` sessions. A test pins the bound;
  four stop conditions were exercised end to end against a stand-in binary.
- Two processes writing one ledger lose nothing; a contested task move has exactly one winner.
- `delphi init` is idempotent, keeps files the user owns, and preserves the project block inside each seat.
- The board refuses `ready` without acceptance criteria, `done` without a report, `blocked` without a reason.
- All three hooks behave: PreToolUse denies the orchestrator editing source and allows the ledger, malformed
  stdin does not break a session, PreCompact writes a checkpoint.
- npm and PyPI distributions produce byte-identical `--version` and `--help`.
- Everything above ran from a path containing a space and Vietnamese characters.

## What running it found that reading it did not
1. commander's `.command()` returns the subcommand, so `story` and `team` were never registered.
2. proper-lockfile is CommonJS and was bundled into ESM output, killing the CLI on its first `require`.
3. A hook payload `cwd` Node cannot resolve made SessionStart inject nothing, silently.
4. Earlier: a retry-based file lock has no fairness, so concurrent writers starve (ADR-0008).
5. Earlier: execa 10 and commander 15 both need Node 22, quietly breaking the declared floor.
6. **Every background dispatch was broken on Windows, and had been since Phase 2.** `claude` on PATH is an
   npm `.cmd` shim; `cmd.exe` treats a line break as a command separator, and every spawn prompt is
   multi-line, so execa refused the call before the session existed. `dept up`, `dispatch` and `meeting`
   were all affected. The adapter now resolves the shim to the `.exe` it names (C-017).
7. The loop counted review rounds, so a seat that stopped without touching the board left the next decision
   identical to the last one and the same story was dispatched forever. It counts every dispatch now.

**Found by running a department live, on 2026-09-17 — none of these had a test that caught them:**

8. **A finished seat blocked the whole department.** A background session that has completed its turn sits at
   `state: blocked, status: idle`; it is not `done`, which happens only once it is stopped. The active-limit
   filter was `state !== 'done'`, so every seat that had ever run still counted, and the next story could
   never start. Active now means working.
9. **`watch` and `dept status` reported every background session on the machine as a seat.** One from an
   unrelated project appeared named after itself and marked blocked. Both now join against `sessions.log`.
10. **The journal template was read as an event.** `parseEntry` accepted any line with four pipe-separated
    fields, and the template documents its own format on a line that has four. `watch` printed "SO ti" where
    the time goes. A line must start with a timestamp now.
11. **The orchestrator gate denied a relative path to its own ledger.** The allow-list matched `/.delphi/`
    with a leading separator, so an absolute path passed and a relative one did not.
12. **Windows Terminal could not launch the pane command.** It starts the command itself and does not resolve
    PATHEXT, so a bare `claude` — the npm `.cmd` shim — failed with "the system cannot find the file
    specified". Panes launch the resolved `.exe`. Same root as C-017, one layer out.
13. **A team could name a seat the project never built.** `quick-fix` names a reviewer; a `feature` project
    has none, so the plan held it as "nothing assigned yet" and the review step went missing silently.

Each has a test now.

## Open items
0. **`dispatch.confirm_before_dispatch` is declared, defaults to `true`, and is never read** — the config
   promises a confirmation gate before spending quota that does not exist. It is in the spec
   (CUSTOMIZATION_SPEC §188), so implementing or removing it is the owner's call. If implemented, it must
   only prompt when `process.stdout.isTTY`: the orchestrator runs `dept up` through the Bash tool in a
   non-interactive session and a prompt there would hang the department.
1. `packages/cli` has no README, so the npm page would be blank. Needed before the first publish.
2. `delphi cost` ships counting sessions rather than money, and says so in its own output. Whether to
   keep it at all is still the owner's call at release (C-009).
3. Spike 6 — whether a VS Code extension session binds a cross-session inbox — still needs the owner to
   run it, because it needs a Claude Code session started inside VS Code. `scripts/spike-vscode-inbox.mjs`
   is written and ready. Nothing in the extension depends on the answer: it reads the ledger, not sessions.
   It is the last unanswered item in the verification matrix.

## Blockers
None.

## Next step
**Phase 6 — surface and docs**, pending approval: `watch --web`, the docs site, the three packs
(software-team, solo-dev, content-team), the contribution guide, and `docs/traceability.md` mapping
R01-R25 to where each requirement is met.

## Quick verification commands
```bash
pnpm check                      # lint, build, typecheck, 357 tests
node scripts/loop-lab.mjs       # the loop end to end, for free
node packages/cli/dist/index.js doctor
```

## Picking this up on another machine
`.build/HANDOFF.md` is the whole context: what is being built, who decides what, the rules that are not
yours to change, where the build stands, and every trap already paid for. Read it before touching anything.
`docs/try-it.md` is the hands-on guide, with the quota-spending commands marked.
