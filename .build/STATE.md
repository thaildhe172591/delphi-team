# BUILD STATE

Updated: 2026-09-17 · **Phase 2 (MVP) — DONE**, all three stages. Waiting on the owner to approve Phase 3.

## Current phase
Phase 2 complete: 2a core, 2b templates, 2c CLI, skills, hooks and dogfood.
The repository is public, CI runs on every push, and delphi is set up on itself.

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
packages/cli        18 commands, all with --json; the hook entry point
packages/templates  43 files: 15 roles, 8 capabilities, 5 teams, 6 skills,
                    PROTOCOL.md, 9 ledger and 4 artifact templates, sample config
python/             hatchling wheel carrying a compiled binary, no npx fallback
scripts/            sync-version · build-binaries · build-templates
.github/            ci.yml (5 jobs) · install-matrix.yml · issue and PR templates
.delphi/            delphi running on itself, with the remaining phases on its own board
```

## Measured, not assumed
- **244 tests pass.** `packages/core` coverage was 92/85/94/93 at the end of 2a and has grown since.
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

Each has a test now.

## Open items
1. `packages/cli` has no README, so the npm page would be blank. Needed before the first publish.
2. Spike 5 (`teams` with two teammates) is due in Phase 3; spike 6 (VS Code extension inbox) in Phase 5.
3. `delphi cost` needs re-scoping with the owner in Phase 4 (C-009).
4. `delphi inbox`, `handoff`, `next`, `status`, `watch`, `dept up/down` are Phase 3.

## Blockers
None.

## Next step
**Phase 3 — full dispatch**, pending approval: `dept up --mode teams` in-process and tmux, the
`TaskCreated`/`TaskCompleted`/`TeammateIdle` hooks, `--surface wt|tmux|desktop`, `dept status/down`,
`shift end`, and `task/handoff/inbox/report/next/status/watch`.

## Quick verification commands
```bash
pnpm check && node packages/cli/dist/index.js doctor
```
