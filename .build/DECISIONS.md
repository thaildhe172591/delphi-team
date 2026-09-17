# BUILD DECISIONS (ADR)

## ADR-0001 — Build on native Claude Code primitives
**Status:** accepted · 2026-09-17
**Context:** delphi-team coordinates several Claude Code sessions as a "department". A harness could either
re-implement session/agent orchestration itself, or drive the features Claude Code already ships.
**Decision:** build strictly on native primitives — subagent definitions, `--agent`, `--bg`, `--model`,
`--effort`, `--name`, `--resume`, hooks, skills, Agent Teams, background sessions, cross-session messaging,
plugins. A single adapter layer (`packages/core/adapters/claude`) is the only place that shells out to `claude`.
**Consequences:** the harness stays small and survives product changes behind one adapter; features Claude Code
does not expose are out of scope rather than re-built; every assumed flag/field must be verified in Phase 0.

## ADR-0002 — Repository location and spec placement
**Status:** accepted · 2026-09-17
**Context:** the working folder was `pythia-agents-team` while R25 fixes the project name as `delphi-team`,
and the spec bundle lived in `architectures-design/` while BUILD_PROMPT references `docs/spec/*.md`.
**Decision:** rename the folder to `delphi-team`; move the spec bundle to `docs/spec/`; delete the
byte-identical nested duplicate so there is exactly one source of truth.
**Consequences:** BUILD_PROMPT's documented restart line ("read docs/spec/BUILD_PROMPT.md and .build/STATE.md")
works verbatim in later sessions.
