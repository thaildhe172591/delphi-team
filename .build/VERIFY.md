# VERIFY — Phase 0 verification matrix

Claude Code **2.1.274** on Windows 11 Pro 22621 · verified 2026-09-17
Sources: official docs at `https://code.claude.com/docs/` (fetched 2026-09-17), plus local probes on this machine.
Verdicts: **VERIFIED** (docs or a local probe state it) · **UNVERIFIED** (docs silent) · **NOT SUPPORTED** (docs say no) ·
**BLOCKED** (could not test here).

---

## 0. Toolchain (local probe)

| Tool | Result |
|---|---|
| Claude Code | 2.1.274, `/c/nvm4w/nodejs/claude` |
| Node / npm / pnpm | v22.16.0 / 10.9.2 / 10.33.2 — meets `engines >=20` |
| git | 2.54.0.windows.1 |
| Python / uv | 3.14.6 / 0.11.23 — **`pipx` not installed** (the install matrix needs it) |
| `wt` | present · `tmux` absent (expected on Windows native) |
| `delphi` / `dt` / `delphi-team` | none on PATH — no local collision |

---

## 1. CLI surface (local probe: `claude --help`, `claude agents --help`)

| Item | Verdict | Finding |
|---|---|---|
| `--agent`, `--model`, `--effort`, `-n/--name`, `-r/--resume` | VERIFIED | All present. `--effort` takes `low/medium/high/xhigh/max`. |
| `--bg / --background` | VERIFIED | Prints an id for `attach`/`logs`/`stop`/`rm`; `claude agents` lists them. |
| `--autocompact <auto\|tokens>` | VERIFIED | Accepts `auto` or 100k–1M. |
| `--agents <json>` | VERIFIED | Inline agent definitions — a fallback when writing files is unwanted. |
| Subcommands | VERIFIED | `agents · attach · logs · stop/kill · rm · respawn · doctor · plugin · mcp · project · install · import`. |
| `claude agents --json [--all] [--cwd]` | VERIFIED | `--json` works without a TTY. `--all` adds completed sessions. |

---

## 2. Hooks

| Item | Verdict | Finding | Impact on delphi-team |
|---|---|---|---|
| SessionStart fires, receives stdin | **VERIFIED (local probe)** | Captured payload: `session_id`, `transcript_path`, `cwd`, `agent_type`, `hook_event_name`, `source`. | The hook reads `agent_type` — a seat identifies itself **without** `DELPHI_SEAT`. |
| `agent_type` absent without `--agent` | **VERIFIED (local probe)** | A second probe with no `--agent` logged no `agent_type`. | Hook falls back to `DELPHI_SEAT`, then to "unknown seat → ask the orchestrator" (PROTOCOL §1). |
| `source` values | **VERIFIED — spec is wrong** | Five, not four: `startup`, `resume`, `clear`, `compact`, **`fork`** (added 2.1.214). Locally confirmed `startup` and `resume`. | HARNESS_DESIGN §5 and ORCHESTRATION_SPEC §12 enumerate four. **Must handle `fork`.** → C-002 |
| Context injection | VERIFIED | Both plain stdout **and** `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}` work. | Use the JSON form — explicit and future-proof. |
| Injection size limit | **VERIFIED — new constraint** | Over **10,000 characters** the text is spilled to a file and replaced by a path + preview. | `context.session_start_budget_kb: 4` is safely under. Keep it. |
| Hook config schema | VERIFIED | `hooks` → `<EventName>` → `[{matcher, hooks:[{type, command, timeout, …}]}]`. Matcher optional — locally confirmed working without one. | As assumed by the spec. |
| Default timeout | **VERIFIED — spec assumption wrong** | **600 s** for `command` handlers, not 60. No documented maximum. | Set an explicit short `timeout` on every delphi hook. |
| Fail-open | **VERIFIED (docs + local probe)** | Only **exit 2** blocks. Exit 1 or malformed stdout = non-blocking error, session proceeds. A *timed-out* `PreToolUse` does **not** gate. | Matches the spec's fail-open rule. **But** a PreToolUse hook is not a reliable security gate — the permission system is. Affects R23. |
| `PreCompact` | **VERIFIED — design change needed** | Payload adds `trigger` (`manual`/`auto`) and `custom_instructions`. It **can block but cannot inject**; `systemMessage` and `continue` are discarded. | ORCHESTRATION_SPEC §12 wants it to "remind / write a checkpoint". The **reminder half is impossible** — make the hook *write* the checkpoint as a side effect. → C-003 |
| `PreToolUse` deny shape | VERIFIED | `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"…"}}`; values `allow/deny/ask/defer`; blocking exit code 2. | Matcher caution: `Edit.*` also matches `NotebookEdit` — use `^Edit$`. |
| `SubagentStop` | VERIFIED | Exists; payload carries `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`. | The optional JOURNAL hook is feasible. |
| `TaskCreated` / `TaskCompleted` / `TeammateIdle` | VERIFIED | Exist under exactly those names, no matcher support. Payloads carry `task_id`, `task_subject`, `task_description?`, `teammate_name`, `team_name` (**`team_name` is deprecated**). | ORCHESTRATION_SPEC §12 is correct. Do not build on `team_name`. |
| Blocking a task | VERIFIED | `TaskCreated`: exit 2 or `{"decision":"block","reason":…}` deletes the task. `TaskCompleted`: exit 2 blocks completion. | The R12 quality gate is implementable as specified. |
| Hook inheritance | VERIFIED / UNVERIFIED | Settings-file hooks **do** run inside subagents. Whether they run for **teammates** is **not documented**. | Phase 3 risk — teams-mode gates need a CLI fallback. |

---

## 3. Agent Teams (`teams` dispatch mode)

| Item | Verdict | Finding | Impact |
|---|---|---|---|
| Enablement | VERIFIED | Experimental, **off by default**; env var `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. **No settings key exists.** | `delphi doctor` checks the env var, not a setting. |
| Spawn mechanism | VERIFIED | The lead calls the **Agent tool with a `name`**; that makes a teammate rather than a subagent. | Skill `/dept` instructs the orchestrator accordingly. |
| Definition fields applying to a teammate | **VERIFIED — narrower than assumed** | Applies: `tools`, `model`, body. **`skills` explicitly not applied** (either mode). `mcpServers`: split-pane only. `effort`, `memory`, `hooks`, `disallowedTools`, `color`, `description` are **never addressed** — treat as not applying. | ROLES_SPEC §1 is right to demand every mandatory procedure live **in the body**. MEMORY_SPEC §1's note on self-managed L3 memory is **required**, not optional. |
| Per-teammate model | VERIFIED | Yes. Order: spawn prompt → definition `model` (`inherit` = lead) → `CLAUDE_CODE_SUBAGENT_MODEL` → lead's model. | Matches ORCHESTRATION_SPEC §3. |
| Per-teammate effort | **NOT SUPPORTED** | Teammates inherit the **lead's** effort. `/model` and `/fast` are lead-only. | Confirms the spec's `[VERIFY]`. `dispatch.mode: auto` must fall back to `sessions` when a seat needs a different effort from the orchestrator — the rule in ORCHESTRATION_SPEC §2 step 2 **stays**. |
| `teammateMode` | VERIFIED | **Top-level** settings key: `in-process` (default), `auto`, `tmux`, `iterm2`. | delphi's `dispatch.teams.teammate_mode` maps onto it. |
| `subagentPromptCacheTtl` | VERIFIED | Top-level key, `"5m"` / `"1h"`; default unset → subagents and teammates land in the 5-minute bucket. | HARNESS_DESIGN §3's "set 1h" advice is correct. |
| Desktop / VS Code | **NOT SUPPORTED (Desktop)** / UNVERIFIED (VS Code ext) | Docs: teams are "available in the CLI, not in Desktop". Requires an **interactive** session — `-p` and the Agent SDK never spawn teammates. | R16 Desktop support goes through `manual` mode only — already the spec's design. |
| Teammate resume | **NOT SUPPORTED** | `/resume` and `/rewind` do not restore in-process teammates; the team dir is deleted at session end. Only `~/.claude/tasks/{team}/` persists. | Confirms HARNESS_DESIGN §3 — rebuild the team each shift from the ledger. |
| Mailbox / task tools | VERIFIED | Mailbox = `~/.claude/teams/{team}/inboxes/{agent}.json`. Tools: `SendMessage`, `ListAgents`, `TaskCreate/TaskGet/TaskList/TaskUpdate`. | — |
| **Task tool availability** | **VERIFIED — blocking gotcha** | Task tools are **not available by default on Opus 5** (they ship by default on Claude 3.x, Opus 4–4.7, Sonnet 4–4.6, Haiku 4.5). Without them the shared task list stays empty and teammates coordinate by message only. Opt in with `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`. | **R11's shared task list is not free.** `doctor` must check it and `dept up --mode teams` must set or require it. → C-004 |
| Team view keys | VERIFIED | ↑/↓ select · Enter open + message · Esc clear/interrupt · `x` stop · **Ctrl+T** task list. | R13 partly satisfied natively. |
| Side effect of enabling teams | VERIFIED | With the env var on, **any subagent Claude names on its own launches as a teammate**. Teammate **plan approval is auto-granted without the lead reviewing it**. | Safety note for R23; `delphi doctor` warns. |

---

## 4. Cross-session messaging (`sessions` and `manual` modes)

| Item | Verdict | Finding | Impact |
|---|---|---|---|
| Mechanism | VERIFIED | `ListAgents` (discover) + `SendMessage` (deliver by name). Named pipe on native Windows; never via Anthropic servers. | R16 orchestrator discovery via `ListAgents` confirmed. |
| Reachability | VERIFIED | Same OS user + same filesystem view. **WSL 2 and native Windows sessions on the same PC cannot reach each other.** Windows needs 2.1.234+ (we have 2.1.274). | Confirms HARNESS_DESIGN §6. Document it loudly in the README. |
| Desktop ↔ CLI | **VERIFIED (local spike)** | `ListAgents` from a Claude Desktop session listed a background session spawned by the CLI seconds earlier, alongside the owner's four named interactive sessions. A `SendMessage` to it was accepted and queued. | R16's "orchestrator discovers seats via ListAgents" works across surfaces. |
| VS Code extension ↔ others | **UNVERIFIED** | No VS Code extension session was running during the spike, so nothing could be observed. | Not on the Phase 1–2 path; `manual` mode via Desktop is proven. Re-test when the extension surface is wired up in Phase 5. |
| **A third session kind exists** | **VERIFIED (local spike)** | `ListAgents` returned 45 peers in three kinds: `bg`, `interactive`, and **`Remote Control`** (40 of them, all `offline`). The spec anticipates only the first two. | `delphi status` must filter to live, same-machine sessions. Forty offline Remote Control rows are not seats, and a department view that lists them is useless. → C-012 |
| Message held for approval | **VERIFIED (local spike)** | Sending from a bypass-permissions session to a manual-mode background session put the receiver at `status: "waiting"`, `waitingFor: "permission prompt"`, `state: "blocked"` — the message was **held for its user's approval**, not delivered to its model. | Exactly the signal ORCHESTRATION_SPEC §6 needs for "seat stuck on a permission": it is readable from `claude agents --json`, so the orchestrator can name the seat and what it waits on. **A successful send is not action** — the orchestrator must never treat delivery as agreement. |
| `notify_when_idle` | **VERIFIED — not what the spec assumed** | It is an **input on the `SendMessage` tool**, not a setting. One-shot, same machine, **main conversation only** (a subagent or teammate that sets it gets no subscription), expires after 12 h. | ORCHESTRATION_SPEC §6 must call it via SendMessage from the orchestrator's main thread. → C-005 |
| Inbound defaults | VERIFIED | `crossSessionInbound` = `accept`/`hold`/`refuse`; when unset the default derives from both sessions' permission-mode classes. Held dialogs expire per `dialogExpiry` (5 min default), at most 100 held. | `delphi doctor` should report the effective value. |
| Limits | VERIFIED | ~1,000,000 char cap; sender-side burst refusal; the receiver queues at most **50**; identical repeats dropped. | Confirms the "batch your updates" rule in ORCHESTRATION_SPEC §5. |

---

## 5. Skills, memory, CLAUDE.md

| Item | Verdict | Finding | Impact |
|---|---|---|---|
| `disable-model-invocation` | **VERIFIED — spec guess correct** | Real field; `true` blocks auto-loading. The inverse is `user-invocable: false`. Locally confirmed `user-invocable` in shipped skills. | `/shift-end` and `/checkpoint` get `disable-model-invocation: true` as specified. |
| Skill frontmatter | VERIFIED | `name, description, when_to_use, argument-hint, arguments, disable-model-invocation, user-invocable, allowed-tools, disallowed-tools, model, effort, context, agent, background, hooks, paths, shell, metadata, license, compatibility`. | The schema for delphi's skill linter. |
| Skill re-injection after compact | **VERIFIED — new constraint** | The most recent invocation of each skill is re-attached, **first 5,000 tokens each**, within a shared **25,000-token** budget, most-recent-first; older skills can be dropped entirely. | ORCHESTRATION_SPEC §12's "put the important part first" is correct **and now quantified**: `/seat` must fit its identity block inside the first 5,000 tokens. |
| Skill description budget | VERIFIED | The listing keeps every name; descriptions are trimmed to **1% of the context window**, per-entry cap 1,536 chars. | ROLES_SPEC §1's "keep the description short" confirmed. |
| CLAUDE.md `@path` import | VERIFIED | Syntax `@path`; relative resolves against the **importing file**; recursion to a **maximum of 4 hops**; imports inside code fences are skipped. The project-root CLAUDE.md is re-read and re-injected after `/compact`. | `@.delphi/PROTOCOL.md` works and survives compaction — exactly the mechanism ORCHESTRATION_SPEC §11 relies on. |
| `memory: project` | VERIFIED / partly UNVERIFIED | Gives a subagent `.claude/agent-memory/<name>/`, preloads `MEMORY.md`, force-enables Read/Write/Edit. Gated behind auto memory (`autoMemoryEnabled`). **Whether it applies to `claude --agent` as the main session is UNVERIFIED**; for teammates it is not addressed. | MEMORY_SPEC §1's caveat holds. Role bodies must instruct self-managed memory. `doctor` checks `autoMemoryEnabled`. |
| MEMORY.md auto-load size | **VERIFIED — new number** | First **200 lines or 25 KB**, whichever comes first. | `memory.compact_threshold_lines: 180` in the sample config is well chosen — keep it. |

---

## 6. Sessions, models, images, plugins

| Item | Verdict | Finding | Impact |
|---|---|---|---|
| Background session lifecycle | VERIFIED | A separate supervisor runs them; closing the terminal does not stop work. State lives in `~/.claude/daemon/roster.json` and `~/.claude/jobs/<id>/state.json`. | Read it through `claude agents --json`, never by parsing those files. |
| `--bg` + `--agent/--model/--effort/--name` | VERIFIED | All four combine. | `delphi dispatch` as specified. |
| **`--bg` with `-p`** | **NOT SUPPORTED** | Rejected before session creation. | A harness must never build `claude -p --bg`. → C-006 |
| `claude --bg` from a session's Bash | **VERIFIED (local spike)** — docs silent | The docs never address it, but it works: `claude --bg "…" --agent spike-seat --model haiku --effort low --name spike-bg-1` run from the Bash tool **inside this session** printed `backgrounded · fb9a45c6 · spike-bg-1` and the session ran to `state: "done"`. All four flags combined. | **`sessions` dispatch and R17 are unblocked.** Because the docs are silent, `delphi doctor` probes it at runtime rather than assuming it. |
| `claude logs <id>` output | **VERIFIED (local spike)** | Returns **raw ANSI terminal output**, not structured text — cursor moves, colour codes, status line and all. | `delphi status`/`watch` must never parse `claude logs`. Seat progress comes from the ledger the seat writes, which is what MEMORY_SPEC already mandates. |
| Agent view status | VERIFIED | **Research preview.** On by default; `disableAgentView` turns it off. | Note it under the README's known limitations. |
| `claude agents --json` fields | **VERIFIED — spec guess wrong** | `cwd`, `kind` (`interactive`/`background`), `startedAt` always; `id` and `state` on background only; `pid`, `status`, `waitingFor`, `sessionId`, `name` when applicable. **No `model` and no `agent` field.** | `delphi status` cannot read a seat's model or agent back — it must track that itself in `sessions.log` (MEMORY_SPEC §2 already has that file). Entries with `kind: interactive` have no `id`; do not assume they are attachable. → C-007 |
| Model aliases | VERIFIED | `default, best, fable, sonnet, opus, haiku, sonnet[1m], opus[1m], opusplan`; pin full ids via `--model claude-sonnet-5` or `ANTHROPIC_DEFAULT_*_MODEL`. | The config's `claude-opus-4-8` for dev-be is a valid full-id form. |
| Effort values | VERIFIED | `low, medium, high, xhigh, max` (+ `ultracode`). **Opus 4.6 and Sonnet 4.6 have no `xhigh`.** Docs warn `max` shows diminishing returns and is prone to overthinking. | HARNESS_DESIGN §4's note confirmed. `doctor` should reject `xhigh` on a model that lacks it. |
| **Fable billing** | **VERIFIED — R09 risk** | "Depending on your plan and seat tier, Fable usage can bill to usage credits." The consent prompt appears interactively but **never** in `-p` or the SDK, which bill without asking. | The orchestrator defaults to `fable` (R09). `doctor` and `dept up` must warn once. → C-008 |
| Auto-compact default | **VERIFIED — spec assumption wrong** | Not a percentage. Native-1M models compact at ~967K; 200K-window deployments at 200K. | `context.orchestrator_autocompact: 400k` is a real tightening, which is the intent. Keep it. |
| Prompt cache TTL | VERIFIED | `5m` / `1h` only. Subscriptions already default to 1h for the **main** conversation and drop to 5m once in usage credits. | — |
| **Alt+V** | **VERIFIED — spec guess correct** | Action `chat:imagePaste`; default **Ctrl+V, Alt+V on Windows and WSL**. File `~/.claude/keybindings.json` (`/keybindings` opens it), hot-reloaded; schema `{bindings:[{context, bindings:{"<key>":"ns:action"\|null}}]}`. **No such file on this machine → the default binding is in force.** | R15 satisfied. `doctor` checks the file only to detect a *rebind*, and must treat "absent" as OK. |
| Read reads images | VERIFIED | PNG/JPG and other formats come back as visual content; an image still over 500 KB after resize is re-encoded as reduced-quality JPEG. | R15 satisfied — seats read `.delphi/assets/*.png` by path. |
| Plugin layout | **VERIFIED (docs + local probe)** | `<root>/.claude-plugin/plugin.json` (only `name` required); every other directory sits at the plugin **root**. Locally confirmed on shipped plugins: manifest `{name, description, author}` plus `agents/` and `commands/`. | The target layout for `delphi export plugin` is settled. |
| Plugin agent limitations | **VERIFIED — spec correct verbatim** | "plugin-shipped agents don't support `hooks`, `mcpServers`, or `permissionMode`." | PACKAGING_SPEC §1's warning stands. |
| Marketplace | VERIFIED | `/plugin marketplace add <owner>/<repo>`; requires `<repo-root>/.claude-plugin/marketplace.json` with `name`, `owner.name`, `plugins[]`. | Phase 7 task. |
| **Cost data source** | **UNVERIFIED / effectively unavailable** | No documented stable local file. `~/.claude/stats-cache.json` has no schema and no stability statement. The two documented programmatic surfaces — status-line stdin JSON and `claude -p --output-format json` — both require *us* to run the session. | `delphi cost` (Phase 4, R06) cannot read historical spend reliably. **Re-scope** it to sum only what delphi itself dispatches. → C-009 |

---

## 7. Packaging (docs + local empirical tests on this machine)

| Item | Verdict | Finding | Impact |
|---|---|---|---|
| `bun build --compile` | VERIFIED | True cross-compilation from one host to `bun-{linux,windows,darwin}-{x64,arm64}` plus musl variants — all six targets in PACKAGING_SPEC §3 and more. | **Chosen tool.** |
| Bun binary size | UNVERIFIED (no official figure) | No published number; Bun's own docs say the binary "is still way too big". Proxy from the v1.4.2 runtime packages: 75.8 MB linux-x64, 82.1 MB windows-x64, 59.0 MB darwin-arm64 → **budget 60–85 MB per binary**. | Real cost of the "no Node needed" promise. Must appear in the README and the release notes. |
| Bun code signing | VERIFIED / NOT SUPPORTED | macOS: `codesign` with `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation` entitlements is **required** to clear Gatekeeper. Windows: Bun has **no signing support** (only icon/console/metadata flags, and those cannot be used while cross-compiling) — Authenticode is out-of-band. | A CI task for Phase 7, not a blocker. |
| Node SEA | **NOT SUPPORTED for our matrix** | Stability 1.1 (active development). CI-tested platforms exclude **macOS x64** and **Alpine/musl** entirely. Cross-compiling also forces `useCodeCache`/`useSnapshot` off. | Rejected. |
| `pkg` | **NOT SUPPORTED** | Deprecated at 5.8.1; repo archived 2024-01-13; the README itself redirects to Node SEA. | Rejected. |
| hatchling platform wheel | **VERIFIED (built one locally)** | A hatchling **custom build hook** (`[tool.hatch.build.targets.wheel.hooks.custom]`) setting `build_data["pure_python"]=False` and an explicit `build_data["tag"]`. Also needs `artifacts = ["*.exe"]`, or hatchling's VCS-aware file selection silently drops a gitignored binary. A probe wheel `…-py3-none-win_amd64.whl` was produced with `Root-Is-Purelib: false` and the binary inside. | No third-party plugin needed. |
| Wheel platform tags | VERIFIED | `py3-none-win_amd64` · `py3-none-macosx_11_0_arm64` · `py3-none-macosx_10_12_x86_64` · `py3-none-manylinux_2_17_x86_64.manylinux2014_x86_64` · `py3-none-manylinux_2_17_aarch64.manylinux2014_aarch64` · `py3-none-musllinux_1_2_x86_64`. ABI stays `none` — no Python C-ABI involved. | — |
| Python shim | **VERIFIED (ran it)** | `os.execv` on POSIX (stdio and signals inherited, exit code is the binary's own); `sys.exit(subprocess.run([...]).returncode)` on Windows, which has no real execv. argv forwarding, stdout passthrough and a non-zero exit code all confirmed. | Exactly the shim PACKAGING_SPEC §1 describes. |
| `uvx` / `pipx` with platform wheels | **VERIFIED (ran it)** | `uvx --from <wheel> <cmd>`, `uv tool install <wheel>` and `pipx install <path.whl>` all work. Caveats: a wheel whose tag does not match the host is rejected outright, so local-file installs only work per platform — installing **by name** from PyPI is what selects the right wheel; and `uvx --from pkg cmd` runs the **entry-point** name, not the package name. | The install matrix must install by name from TestPyPI, not from a local file, to exercise tag selection. |
| PyPI trusted publishing | VERIFIED | Production-ready; job-level `permissions: id-token: write`, `environment: pypi`, `pypa/gh-action-pypi-publish@release/v1`. It uploads everything in `dist/` in one call, so N platform wheels plus the sdist publish together. | Matches PACKAGING_SPEC §6. |
| npm trusted publishing | VERIFIED | GA. Requires **npm ≥ 11.5.1 and Node ≥ 22.14.0**, `permissions: id-token: write`, and **GitHub-hosted runners only**. Provenance is generated automatically — no `--provenance` flag. | Local npm is 10.9.2; CI must pin a newer npm. Node 22.16 already qualifies. |
| npm org `@delphi-team` | VERIFIED | Free: org creation offers an "Unlimited public packages" free plan. First publish needs `--access public`. | PACKAGING_SPEC §0's `[VERIFY]` answered — yes. |
| **npm name `delphi-team`** | **VERIFIED — AVAILABLE** | `GET registry.npmjs.org/delphi-team` → **404**. Scope `@delphi-team` also unclaimed. Checked 2026-09-17. | R25 name is free. Re-check immediately before publishing. |
| **PyPI name `delphi-team`** | **VERIFIED — AVAILABLE** | `GET pypi.org/pypi/delphi-team/json` → **404**. Normalization means `delphi_team` is the same name and equally free. Checked 2026-09-17. | Same. |
| Command `delphi` | VERIFIED — safe | No `delphi` executable in any mainstream toolchain (no Homebrew formula; Embarcadero's Delphi compiler is `dcc32.exe`/`dcc64.exe`). The *package* name `delphi` is taken on both registries, but we do not want it. | Keep `delphi` as the short command. |
| **Command `dt`** | **VERIFIED — real conflict** | DITrack ships a `dt(1)` client; RobinTMiller/`dt` is a long-standing disk/tape test tool; npm `dt` and PyPI `dt` are both taken; `dt` is also a very common personal shell alias. | PACKAGING_SPEC §0 says "if it conflicts, drop that alias". **Drop `dt`.** → C-010 |
| `py3-none-any` npx fallback | Flagged | The fallback reintroduces a Node requirement for exactly the pip/uvx users the wheel exists to serve. | Recommend failing loudly with an install hint instead of silently shelling out to `npx`. Owner's call → see the Phase 0 report. |

---

## 8. Live spikes (WORKFLOW §5 Phase 0 item 3)

The CLI's OAuth session had expired; the owner re-authenticated on 2026-09-17 and the spikes then ran.

| # | Spike | Result |
|---|---|---|
| 1 | Does `additionalContext` reach the model, and does `--agent` load the definition body when run as the main session? | **PASS — both.** A `SessionStart` hook emitting `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"The delphi spike marker is DELTA-ALPHA-7X9."}}` plus `claude -p --agent spike-seat` returned `Delphi spike marker: DELTA-ALPHA-7X9, Codeword: ZEBRA-QUARTZ` — the injected marker and the codeword that exists only in the agent definition body. |
| 2 | Does `claude --bg` run from the Bash tool inside a live session? | **PASS.** `--bg --agent --model --effort --name` all combined; the session backgrounded, ran and reached `state: "done"`. |
| 3 | `claude agents --json` field shape | **PASS, and it confirms C-007.** The union of fields observed across six live entries was exactly `cwd, id, kind, name, pid, sessionId, startedAt, state, status` (+ `waitingFor` when waiting). **No `model`, no `agent`.** |
| 4 | Cross-session discovery and delivery, Desktop → CLI background session | **PASS with an important caveat.** `ListAgents` from the Desktop session saw the CLI-spawned session; `SendMessage` was accepted and queued; the receiver then sat at `waitingFor: "permission prompt"`, `state: "blocked"` because it ran in a different permission mode. Delivery ≠ action. |
| 5 | Two-teammate `teams` spike | **NOT RUN.** Agent Teams needs an **interactive CLI** session — `-p` never spawns teammates and Desktop does not support teams at all, so it cannot be driven from a tool call. Deferred to Phase 3, which is where `teams` mode is actually built. |
| 6 | VS Code extension session reachable via `ListAgents` | **NOT RUN.** No extension session was open. Deferred to Phase 5, where the VS Code surface is built. Not on the Phase 1–2 path. |

| 7 | `wt -w 0 split-pane` for the `--surface wt` terminal split | **PASS.** Run by the owner 2026-09-17: the pane opened in the **current** Windows Terminal window, which is what `-w 0` is for. `dept up --surface wt` now runs it and prints what it ran. |

### Spike 5 result — Agent Teams, run by the owner 2026-09-17

`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, Claude Code 2.1.274, lead on `claude-opus-5[1m]`.

| Question | Answer |
|---|---|
| Was a team created? | **Yes** — `~/.claude/teams/session-0b74e053/config.json` exists. |
| Did the named agents become teammates? | **No.** The team config lists exactly one member, `team-lead`. The two named agents ran as **background subagents**: `SubagentStart` and `SubagentStop` fired, with subagent ids. No `inboxes/` directory was created. |
| Did `TaskCreated` / `TaskCompleted` / `TeammateIdle` fire? | **No, not once.** |
| Was the shared task list usable? | **No.** The lead reported plainly: "no task tools exist in this session — TaskCreate/TaskList/TodoWrite are not in my toolset and not available via ToolSearch". `~/.claude/tasks/session-0b74e053/` holds no files. |
| Did each agent honour the `model` in its definition? | **Yes.** Both reported `claude-haiku-4-5-20251001` while the lead ran `claude-opus-5[1m]`. |
| Did an agent receive a `skills` entry from its definition? | **Yes** — alpha reported `skill visible: yes`. The docs say a *teammate* never does; a *subagent* evidently does. The distinction matters. |
| Effort per agent | Not separable from this run, since these were subagents rather than teammates. |

**New payload fields, not in the documentation we read:**

- `SessionStart` also carries `scratchpad_dir` and `model` (e.g. `claude-opus-5[1m]`).
- `SubagentStart` carries `prompt_id`, `agent_id`, `agent_type`, and a `cwd` of `<project>/.claude/agents` — **not** the project root.
- `SubagentStop` carries `permission_mode`, `stop_hook_active`, `agent_transcript_path`, **`last_assistant_message`**, `background_tasks` and `session_crons`.

**What this changes.** `teams` mode cannot be built on the shared task list or the team hooks: neither was reachable here. `SubagentStop` is the signal that actually arrives, and `last_assistant_message` carries the seat's closing report, which is more useful than an idle notification. delphi already treats `board.yaml` as the source of truth, so nothing is lost — but the spec's picture of teams mode was optimistic, and pretending otherwise would have produced a feature that silently does nothing. → C-015

Spikes 6 is deferred rather than blocked: neither is needed before the phase that implements the feature it
tests, and both are recorded as open items in `docs/research/claude-code-capabilities.md`.

### Spike fixture

Kept out of the repo, under the session scratchpad: an agent definition, a `SessionStart` hook that logs its stdin
and emits `additionalContext`, and a deliberately broken hook for the fail-open check. All spike background
sessions were stopped and removed afterwards (`claude stop` + `claude rm`, verified zero leftovers).
