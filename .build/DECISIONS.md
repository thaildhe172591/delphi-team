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

## ADR-0003 — Standalone binary: Bun compile, not Node SEA
**Status:** accepted · 2026-09-17 · supersedes the open choice left by PACKAGING_SPEC §1
**Context:** the PyPI wheels must carry a CLI binary so Python users need no Node. Candidates were
`bun build --compile`, Node SEA, and `pkg`.
**Decision:** use `bun build --compile`.
**Evidence:** Bun cross-compiles from one host to every target in PACKAGING_SPEC §3 plus musl. Node SEA is
Stability 1.1 and its CI-tested platforms exclude macOS x64 and Alpine/musl outright, which would drop two rows of
our support matrix. `pkg` was deprecated at 5.8.1 and archived on 2024-01-13, and its own README redirects to SEA.
**Consequences:** ~60–85 MB per binary — the honest price of "no Node required", to be stated in the README and the
release notes. macOS needs `codesign` with jit/unsigned-memory/library-validation entitlements. Bun cannot sign on
Windows, so Authenticode is a separate CI step. A hatchling custom build hook sets `pure_python=False` plus an
explicit wheel tag; a console_script shim `os.execv`s on POSIX and uses `subprocess` on Windows. All three were
built and run end to end during Phase 0.

## ADR-0004 — Drop the `dt` command alias
**Status:** accepted · 2026-09-17
**Context:** PACKAGING_SPEC §0 proposes three command names — `delphi-team`, `delphi`, `dt` — with an explicit
instruction to verify that none collides with a common command and to drop any that does.
**Decision:** ship `delphi-team` and `delphi`. Drop `dt`.
**Evidence:** `dt` collides with DITrack's `dt(1)` client and with RobinTMiller's long-standing disk/tape test tool,
is taken on both npm and PyPI, and is a very common personal shell alias. `delphi` is clean: no mainstream toolchain
ships a `delphi` executable and Embarcadero's compiler is `dcc32.exe`/`dcc64.exe`.
**Consequences:** two command names to document and test instead of three. This follows the spec's own instruction
rather than overriding an architectural decision, so it is not a stop point.

## ADR-0005 — The Python wheel fails loudly instead of falling back to npx
**Status:** accepted · 2026-09-17 · **approved by the owner** · amends PACKAGING_SPEC §1
**Context:** PACKAGING_SPEC §1 specifies a `py3-none-any` fallback wheel whose shim calls
`npx --yes delphi-team@<version>`. Phase 0 verification observed that this reintroduces a Node runtime requirement
for exactly the pip/uvx users the platform wheels exist to serve — a hidden dependency, discovered at run time.
**Decision:** ship the platform wheels only. On a platform with no binary, the package fails with a clear message
naming the platform and pointing at the npm install path. Nothing shells out to `npx`.
**Consequences:** one less code path and no hidden Node dependency; users on an unsupported platform get an
explicit instruction instead of a silent runtime download. This amends a decision recorded in the spec bundle, so
it was put to the owner and approved before being written down.
