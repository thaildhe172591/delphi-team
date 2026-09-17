# BUILD STATE

Updated: 2026-09-17 · **Phase 0 (Verification) — DONE except the live spikes, which are BLOCKED**

## Current phase
Phase 0 — Verification. No product code written, as the spec requires.
Waiting on the owner: approve Phase 0, and unblock the CLI spikes.

## Environment (verified 2026-09-17)
| Tool | Version | Note |
|---|---|---|
| Claude Code | 2.1.274 | `/c/nvm4w/nodejs/claude` |
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
- `git init` done, one commit so far, **no remote** — creating the public repo is a mandatory stop point (R04).

## Done in Phase 0
- Toolchain and CLI surface probed locally.
- Four documentation-research passes over the official docs, covering every `[VERIFY]` item in the spec bundle.
- Two local hook spikes (payload capture, fail-open).
- Pythia surveyed on this machine — facts, not guesses.
- Deliverables written: `.build/VERIFY.md`, `.build/CONFLICTS.md` (C-001..C-010),
  `docs/research/claude-code-capabilities.md`, `docs/research/pythia-capability-notes.md`,
  ADR-0001..ADR-0004.

## Blockers
1. **The `claude` CLI cannot authenticate.** Freshly spawned CLI processes return
   `OAuth session expired and could not be refreshed`. This blocks the four live spikes in `.build/VERIFY.md` §8 —
   most importantly whether `claude --bg` works from inside a session, which is what `sessions` dispatch and R17
   rest on. Fix: the owner runs `claude auth login` in an ordinary terminal.
2. An empty leftover folder `D:\dev-project\personal\pythia-agents-team` could not be removed while this session
   held a handle on it. Harmless; delete it any time.

## Next steps
1. Owner approves Phase 0 (mandatory stop point) and answers the two open questions in the Phase 0 report.
2. Owner runs `claude auth login`; re-run the four spikes; update `.build/VERIFY.md` §8.
3. Phase 1 — repo skeleton: monorepo per PACKAGING_SPEC §2, TypeScript strict, vitest, biome, changesets,
   LICENSE/CONTRIBUTING/SECURITY/CODE_OF_CONDUCT, `ci.yml`, the `python/` shim, a trial Windows x64 binary,
   and the first `install-matrix.yml`. **Stop before creating the public GitHub repo or pushing.**

## Quick verification commands
```bash
claude --version && claude agents --json --all
```
