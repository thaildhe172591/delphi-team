# BUILD STATE

Updated: 2026-09-17 · **Phase 3 (Full dispatch) — DONE.** Waiting on the owner to approve Phase 4.

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
2. `delphi cost` needs re-scoping with the owner (C-009): there is no stable local source for historical
   spend, so it can only report what delphi itself dispatched.
3. Spike 6 — whether a VS Code extension session binds a cross-session inbox — is due in Phase 5, where
   that surface is built. It is the last unanswered item in the verification matrix.

## Blockers
None.

## Next step
**Phase 4 — advanced management**, pending approval: `worktree`, `memory show/compact`, `upgrade`,
`export plugin`, `meeting`, `cost` (needs re-scoping, C-009), `doctor --score`, `import bmad`.

## Quick verification commands
```bash
pnpm check && node packages/cli/dist/index.js doctor
```
