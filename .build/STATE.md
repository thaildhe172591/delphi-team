# BUILD STATE

Updated: 2026-09-17 · **Phase 5 (Automation) — DONE.** Waiting on the owner to approve Phase 6.

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
packages/cli        20 commands, all with --json; the hook entry point; the MCP server
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
- **345 tests pass.** `packages/core` coverage was 92/85/94/93 at the end of 2a and has grown since.
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

Each has a test now.

## Open items
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
pnpm check && node packages/cli/dist/index.js doctor
```
