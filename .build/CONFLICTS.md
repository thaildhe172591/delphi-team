# SPEC CONFLICTS AND CORRECTIONS

Precedence when specs disagree: REQUIREMENTS > HARNESS_DESIGN > ORCHESTRATION/MEMORY/ROLES/CUSTOMIZATION/PACKAGING > WORKFLOW.

## A. Contradictions inside the spec bundle

| # | Conflict | Files | Resolution |
|---|---|---|---|
| C-001 | The traceability table is `R01–R25` in BUILD_PROMPT §F and REQUIREMENTS, but `R01–R24` in WORKFLOW §5 Phase 6. | BUILD_PROMPT §F, REQUIREMENTS, WORKFLOW §5 | Use **R01–R25**. REQUIREMENTS outranks WORKFLOW and defines 25 requirements. |

## B. Spec assumptions that Phase 0 proved wrong

These are not internal contradictions — they are places where the spec guessed at Claude Code behaviour and
reality differs. Each was marked `[VERIFY]` or implied by one. Evidence is in `.build/VERIFY.md`.

| # | Spec said | Reality (2.1.274) | How we handle it |
|---|---|---|---|
| C-002 | `SessionStart` has four sources: `startup\|resume\|clear\|compact`. | **Five** — `fork` was added in 2.1.214. | The hook handles five. `fork` is treated like `resume` (same session lineage, new id) and is logged distinctly so drift detection can tell them apart. Spec text to be corrected in HARNESS_DESIGN §5 and ORCHESTRATION_SPEC §12. |
| C-003 | `PreCompact` should "remind / write a quick checkpoint for the orchestrator". | `PreCompact` **can block but cannot inject** — `systemMessage` and `continue` are discarded. | The hook *writes* the checkpoint as a side effect and stays silent. The reminder half is dropped; the orchestrator instead learns about it from the `SessionStart source=compact` injection on the other side. |
| C-004 | R11 assumes a **shared task list** is available in `teams` mode. | The Task tools (`TaskCreate/TaskGet/TaskList/TaskUpdate`) are **not available by default on Opus 5**. Without them teammates coordinate by message only and the list stays empty. | `dept up --mode teams` requires `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` and `doctor` checks it. If it is off, delphi's own `board.yaml` remains the single source of truth and the harness says so instead of pretending a list exists. This is fine by design — MEMORY_SPEC's "file is the source of truth" already makes the native list an optimisation, not a dependency. |
| C-005 | `notify_when_idle` is described as something registered in `sessions` mode. | It is an **input on the `SendMessage` tool**, one-shot, same machine, **main conversation only**, expiring after 12 h. | The orchestrator sets it on its own `SendMessage` calls from the main thread. A subagent or teammate cannot subscribe, so the coordination loop in ORCHESTRATION_SPEC §6 must not delegate this step. |
| C-006 | — (implied by treating `-p` and `--bg` as freely combinable CLI surface) | `--bg` **cannot** be combined with `-p/--print`; it is rejected before session creation. | The `claude` adapter never emits both. A unit test asserts it. |
| C-007 | `delphi status` merges `board.yaml` with `claude agents --json --all` to show each seat's model. | The JSON has **no `model` and no `agent` field**, and `kind: "interactive"` entries have no `id`. | delphi records model, effort, agent and session name itself in `projects/<slug>/sessions.log` at dispatch time (MEMORY_SPEC §2 already defines that file) and joins on `name`. `status` never assumes an entry is attachable. |
| C-008 | Orchestrator defaults to `fable` (R09) with no billing note. | Fable **can bill to usage credits** depending on plan and seat tier, and the consent prompt never appears in `-p` or the SDK. | `doctor` and the first `dept up` of a project print a one-time warning. The model stays `fable` — R09 is the owner's explicit choice. |
| C-009 | `delphi cost` reads local cost data `[VERIFY nguồn dữ liệu ổn định]`. | **No documented stable local source.** `stats-cache.json` has no schema or stability guarantee; the two documented surfaces require us to have run the session. | `delphi cost` is re-scoped to report only what delphi itself dispatched, from `sessions.log` plus `claude -p --output-format json` results where delphi ran the process. It will not claim to report total account spend. Phase 4 decision to confirm with the owner. |
| C-010 | CLI aliases `delphi-team`, `delphi`, **`dt`** — with `[VERIFY không xung đột lệnh phổ biến; nếu có, bỏ alias đó]`. | `dt` genuinely collides: DITrack ships `dt(1)`, RobinTMiller/`dt` is a disk/tape test tool, and `dt` is taken on both npm and PyPI. `delphi` is clean. | **Drop `dt`.** This follows the spec's own instruction rather than overriding it. Commands become `delphi-team` and `delphi`. |

## C. Spec assumptions Phase 0 confirmed (no change needed)

- Teammates inherit the **lead's effort** — ORCHESTRATION_SPEC §2's fallback to `sessions` for seats needing a
  different effort was the right call.
- Teammates do **not** get `skills` from frontmatter and may not get `mcpServers` — ROLES_SPEC §1's rule that every
  mandatory procedure lives in the role **body** is required, and MEMORY_SPEC §1's self-managed L3 memory note is too.
- Agent Teams are **not available in Claude Desktop** — R16 is served by `manual` mode, as designed.
- Teammates cannot be resumed — rebuilding the department each shift from the ledger, as HARNESS_DESIGN §3 says.
- `@.delphi/PROTOCOL.md` imported from CLAUDE.md survives compaction — the mechanism ORCHESTRATION_SPEC §11 relies on.
- `disable-model-invocation` is a real skill field.
- Alt+V is the real Windows default for `chat:imagePaste`, and the Read tool reads images by path — R15 holds.
- Plugin-shipped agents really do ignore `hooks`, `mcpServers` and `permissionMode`.

## D. Spec amendments approved by the owner

| # | Spec said | Amended to | Approved |
|---|---|---|---|
| C-011 | PACKAGING_SPEC §1: a `py3-none-any` fallback wheel shims to `npx --yes delphi-team@<version>`. | Platform wheels only; an unsupported platform gets a clear error naming the npm install path. No `npx` shell-out. | 2026-09-17, in chat. See ADR-0005. |

## E. Found by the live spikes (2026-09-17, after re-authentication)

| # | Spec said | Reality | How we handle it |
|---|---|---|---|
| C-012 | Sessions are `interactive` or background; `delphi status` merges them with the board. | `ListAgents` returns a **third kind, `Remote Control`** — on this machine 40 of 45 peers, all `offline`. | `delphi status` and `dept status` filter to live, same-machine sessions. Offline Remote Control rows are never shown as seats. |
| C-013 | ORCHESTRATION_SPEC §6: "seat stuck on a permission → the orchestrator reports which seat, which command, how to approve." | Confirmed implementable, and sharper than the spec assumed: a held message surfaces as `status: "waiting"`, `waitingFor: "permission prompt"`, `state: "blocked"` in `claude agents --json`. A cross-session message between sessions in **different permission modes** is held for the receiving user's approval and never reaches that session's model. | The orchestrator reads `waitingFor` to name the blockage. PROTOCOL.md gains an explicit line: **a successful send is not action** — never treat delivery as agreement, and never re-send to hurry a blocked seat. |

## F. Resolved by the owner

| # | Issue | Why it matters |
|---|---|---|
| C-014 | WORKFLOW §2 fixed the Node floor at `engines >=20`, but Node 20 reached end of life on 2026-04-30. Holding it cost us the current lines of execa and commander, both of which require Node 22. | **Resolved 2026-09-17: the owner raised the floor to `>=22`.** See ADR-0009. The spec line is annotated in place so a later session does not follow the stale value, execa and commander are back on their current releases, and the CI floor job now guards Node 22. |
