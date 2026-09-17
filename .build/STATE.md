# BUILD STATE

Updated: 2026-09-17 · **Phase 2a (Core) — DONE.** Phase 1 complete; the public repository exists and CI runs.

## Current phase
Phase 2 is being built in three reported stages, at the owner's request.
**2a (core) is done.** Next: 2b (all templates and roles), then 2c (CLI commands, skills, hooks, dogfood).

## Environment
| Tool | Version | Note |
|---|---|---|
| Claude Code | 2.1.274 | re-authenticated 2026-09-17 |
| Node / npm / pnpm | 22.16.0 / 10.9.2 / 10.33.2 | npm trusted publishing needs npm ≥ 11.5.1 — CI pins a newer one |
| git | 2.54.0.windows.1 | |
| Python / uv / pipx | 3.14.6 / 0.11.23 / 1.17.3 | pipx installed 2026-09-17 |
| bun | 1.4.2 | installed 2026-09-17, builds the standalone binaries |
| Windows Terminal (`wt`) | present | `tmux` absent, expected on Windows native |
| Pythia | `pythia-plsql` 0.14.2 | latest; a CLI, not an MCP server |
| OS | Windows 11 Pro 22621 | primary target per R14 |

## Stack as built
TypeScript 7.0.2 strict + ESM · vitest 5.0.1 · biome 2.5.14 · changesets 3.0.3 · commander 15.0.0 ·
tsup 8.5.1 (CLI only) · hatchling 1.32 · bun 1.4.2.

## Phase 1 acceptance — measured, not assumed
| Criterion | Result |
|---|---|
| `pnpm install && pnpm build && pnpm test` | green — 12 tests, 2 files |
| Lint and typecheck | clean (`pnpm check` runs all four) |
| `packages/core` coverage ≥ 80% | **100%** (16/16 statements, 15/15 branches, 3/3 functions) |
| `delphi --version` from `npm pack` + `npm i -g` | `0.1.0`, both `delphi` and `delphi-team` |
| Standalone binary via `bun build --compile` | 83 MB Windows x64, runs with no Node, prints `0.1.0` — inside the 60–85 MB estimate from Phase 0 |
| Wheel with the binary | `delphi_team-0.1.0-py3-none-win_amd64.whl`, `Root-Is-Purelib: false` |
| `delphi --version` from `pipx install <wheel>` | `0.1.0` |
| **npm vs PyPI output identical** (PACKAGING_SPEC §8) | `--version` and `--help` byte-identical |
| Exit code through the Windows shim | a bad flag returns 1 |
| ADR-0005 (no npx fallback) | with the binary removed, the shim refuses with exit 1 and an npm install hint |
| `sync-version --check` | detects drift (exit 1), repairs it, returns clean |

## What is in the repository now
```
packages/core       version + minimum-Claude-Code gate, built with tsc
packages/cli        the delphi / delphi-team commands, bundled with tsup
packages/templates  placeholder — Phase 2 fills it
python/             hatchling wheel + argv/stdio/exit-code shim, no npx fallback
scripts/            sync-version.mjs, build-binaries.mjs
.github/            ci.yml, install-matrix.yml, issue and PR templates
docs/spec/          the specification · docs/research/ the verification record
.build/             STATE, JOURNAL, DECISIONS (ADR-0001..0007), CONFLICTS (C-001..C-013), VERIFY
```

## Open items carried forward
1. **`packages/cli` has no README of its own**, so the npm page would be blank. Add one (or reuse the root
   README) before the first publish.
2. **Public repository created 2026-09-17** at github.com/thaildhe172591/delphi-team (owner approved).
3. Spike 5 (`teams` with two teammates) is due in Phase 3; spike 6 (VS Code extension inbox) in Phase 5.
4. `delphi cost` needs re-scoping with the owner in Phase 4 (C-009).

## Blockers
None.

## Next step
**Phase 2 — MVP**, pending approval. Core schema, roles build, ledger with file locking, the `claude` adapter;
all templates (10 roles, team templates, capability packs including the Pythia pack, PROTOCOL.md, ledger and
artifact templates, sample config); commands `init`, `doctor`, `role`, `capability`, `project`, `resume`,
`state/journal/checkpoint`, `story`, `task`, `snap`, `start`, `dispatch`, `hook`; skills `/dept` (manual and
sessions modes), `/resume`, `/seat`, `/role`, `/shift-end`, `/checkpoint`; hooks SessionStart (five sources —
remember `fork`), PreCompact, PreToolUse; then dogfood by running `delphi init` on this repository.

## Quick verification commands
```bash
pnpm check && node packages/cli/dist/index.js --version
```
