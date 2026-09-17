# BUILD STATE

Updated: 2026-09-17 · **Phase 0 (Verification) — DONE.** Waiting on the owner to approve Phase 1.

## Current phase
Phase 0 — Verification, complete. No product code written, as the spec requires.
Next action is the owner's: approve Phase 1 (a mandatory stop point).

## Environment (verified 2026-09-17)
| Tool | Version | Note |
|---|---|---|
| Claude Code | 2.1.274 | `/c/nvm4w/nodejs/claude` · re-authenticated 2026-09-17 |
| Node | v22.16.0 | meets `engines >=20`, and npm trusted publishing's Node ≥ 22.14 |
| npm / pnpm | 10.9.2 / 10.33.2 | npm trusted publishing needs ≥ 11.5.1 — CI must pin a newer npm |
| git | 2.54.0.windows.1 | |
| Python / uv | 3.14.6 / 0.11.23 | **`pipx` not installed** — the install matrix needs it |
| Windows Terminal (`wt`) | present | |
| tmux | absent | expected on Windows native |
| Pythia | `pythia-plsql` 0.14.2 | already the latest release; it is a CLI, not an MCP server |
| OS | Windows 11 Pro 22621 | the primary target per R14 |

## Repo layout decided
- Root: `D:\dev-project\personal\delphi-team` (renamed from `pythia-agents-team`).
- Spec bundle at `docs/spec/` (10 files); the byte-identical nested duplicate was deleted.
- `git init` done, **no remote** — creating the public repo is a mandatory stop point (R04).

## Done in Phase 0
- Toolchain and CLI surface probed locally.
- Four documentation-research passes over the official docs, covering every `[VERIFY]` item in the spec bundle.
- Six live spikes (`.build/VERIFY.md` §8): four ran and passed, two are deferred to the phase that builds the
  feature they test (`teams` needs an interactive CLI session → Phase 3; the VS Code surface → Phase 5).
- Pythia surveyed on this machine — facts, not guesses.
- Deliverables: `.build/VERIFY.md`, `.build/CONFLICTS.md` (C-001..C-013),
  `docs/research/claude-code-capabilities.md`, `docs/research/pythia-capability-notes.md`, ADR-0001..ADR-0005.

## Design consequences carried into Phase 1+
1. Role **bodies** carry every mandatory procedure — teammates do not get `skills`, and `memory`/`effort`/`hooks`
   are not documented as reaching them.
2. delphi records each seat's model, effort and agent in `sessions.log` at dispatch; `claude agents --json`
   cannot report them back.
3. `delphi status` filters `ListAgents` to live, same-machine sessions, and reads `waitingFor` to name a seat
   blocked on a permission prompt.
4. Hooks are quality gates and audit trails, never the security boundary — only exit 2 blocks, and a timed-out
   `PreToolUse` does not gate at all.
5. Seat progress comes from the ledger, never from parsing `claude logs`.
6. Commands are `delphi-team` and `delphi`. `dt` is dropped (ADR-0004).
7. The Python wheel fails loudly on an unsupported platform; no `npx` fallback (ADR-0005).
8. `bun build --compile` produces the binaries (ADR-0003).

## Blockers
None. (One cosmetic leftover: the empty folder `D:\dev-project\personal\pythia-agents-team`, which could not be
removed while this session held a handle on it. Delete it any time.)

## Next step
**Phase 1 — repo skeleton**, pending the owner's approval: monorepo per PACKAGING_SPEC §2, TypeScript strict,
vitest, biome, changesets, LICENSE MIT, README skeleton, CONTRIBUTING/SECURITY/CODE_OF_CONDUCT, issue and PR
templates, `ci.yml` across Windows/macOS/Linux, the `python/` shim skeleton, a trial Windows x64 binary, and the
first `install-matrix.yml`.
**Acceptance:** `pnpm i && pnpm build && pnpm test` green; `delphi --version` runs both from `npm pack` and from a
wheel installed with pipx on Windows.
**Stop before** creating the public GitHub repo or pushing.

## Quick verification commands
```bash
claude --version && claude agents --json --all
```
