# BUILD JOURNAL

2026-09-17 | setup | Read all 9 spec files in docs/spec/ (1315 lines). Duplicate copy confirmed byte-identical.
2026-09-17 | setup | Owner decisions: rename folder to delphi-team; move spec to docs/spec/ + delete duplicate; survey local Pythia install after updating it to latest.
2026-09-17 | setup | Folder renamed pythia-agents-team -> delphi-team. `git init` done. `.build/` created.
2026-09-17 | P0 | Toolchain verified: claude 2.1.274, node 22.16.0, pnpm 10.33.2, git 2.54.0, uv 0.11.23, wt present, tmux + pipx absent.
2026-09-17 | P0 | `claude --help` confirms --agent/--agents/--bg/--model/--effort/--name/--resume/--autocompact/--worktree/--tmux/--permission-mode and subcommands agents|attach|logs|stop|rm|respawn|doctor|plugin|mcp.
2026-09-17 | P0 | `claude agents --help` confirms `--json` (active sessions, no TTY needed), `--all` (include completed), `--cwd` filter.
2026-09-17 | P0 | `~/.claude/keybindings.json` does not exist -> Alt+V binding is at product default, needs doc confirmation.
2026-09-17 | P0 | Local spike: SessionStart hook fires before authentication and receives session_id, transcript_path, cwd, agent_type, hook_event_name, source. Confirmed source=startup and source=resume, and that agent_type is absent without --agent.
2026-09-17 | P0 | Local spike: a hook exiting 1 with malformed stdout did not stop the session -> fail-open confirmed.
2026-09-17 | P0 | BLOCKER: every spawned `claude` CLI process fails with "OAuth session expired and could not be refreshed". Model-side spikes cannot run until the owner runs `claude auth login`.
2026-09-17 | P0 | Four doc-research subagents returned: agent teams + messaging, hooks + skills + memory, sessions + CLI + images + plugins, packaging.
2026-09-17 | P0 | Pythia surveyed: pythia-plsql 0.14.2 (already latest, no update needed). It is a CLI, not an MCP server for Claude Code. Facts recorded in docs/research/pythia-capability-notes.md.
2026-09-17 | P0 | Wrote .build/VERIFY.md, .build/CONFLICTS.md (C-001..C-010) and docs/research/claude-code-capabilities.md.
2026-09-17 | P0 | ADR-0003 (bun build --compile) and ADR-0004 (drop the `dt` alias) recorded.
2026-09-17 | P0 | Owner decision: finish the blocked spikes before Phase 1 - they will run `claude auth login` and signal.
2026-09-17 | P0 | Owner decision: the Python wheel fails loudly instead of falling back to npx (ADR-0005, amends PACKAGING_SPEC section 1, recorded as C-011).
2026-09-17 | P0 | Owner re-authenticated the CLI. Spikes unblocked.
2026-09-17 | P0 | Spike 1 PASS: SessionStart additionalContext reached the model (DELTA-ALPHA-7X9) and the --agent definition body was loaded as the main session (ZEBRA-QUARTZ).
2026-09-17 | P0 | Spike 2 PASS: `claude --bg --agent --model --effort --name` launched from the Bash tool inside a live session; ran to state=done. `sessions` mode and R17 unblocked. Docs never address this, so doctor will probe it at runtime.
2026-09-17 | P0 | Spike 3 PASS: `claude agents --json` field union across six live entries = cwd,id,kind,name,pid,sessionId,startedAt,state,status (+waitingFor). No model, no agent - C-007 confirmed empirically.
2026-09-17 | P0 | Spike 4 PASS: a Desktop session discovered a CLI-spawned background session via ListAgents and SendMessage was queued to it. Receiver then sat at waitingFor="permission prompt", state="blocked" - a held message, not a delivered one.
2026-09-17 | P0 | New findings: ListAgents has a third kind `Remote Control` (40 of 45 peers, offline) -> C-012. Permission-block signal is readable from claude agents --json -> C-013. `claude logs` returns raw ANSI, unparseable.
2026-09-17 | P0 | Spikes 5 (teams, 2 teammates) and 6 (VS Code extension inbox) deferred to Phase 3 and Phase 5 - neither is needed before the phase that builds the feature it tests.
2026-09-17 | P0 | All spike background sessions stopped and removed; zero leftovers verified.
2026-09-17 | P0 | PHASE 0 DONE. Waiting for the owner to approve Phase 1.
2026-09-17 | P1 | Installed bun 1.4.2 and pipx 1.17.3 (owner approved).
2026-09-17 | P1 | Monorepo scaffolded: packages/{core,cli,templates}, python/, scripts/, .github/. TS strict ESM, vitest 5, biome 2.5.14, changesets 3, commander 15, typescript 7.0.2.
2026-09-17 | P1 | TypeScript 7 breaks tsup --dts via rollup-plugin-dts. core switched to plain tsc (ADR-0006); cli keeps tsup for bundling + version inlining.
2026-09-17 | P1 | Fixed: @delphi-team/core was briefly a runtime dependency of the published package - it is inlined by tsup and private, so shipping it would make the tarball uninstallable. Guard test added (ADR-0007).
2026-09-17 | P1 | pnpm check green: biome clean, tsc clean, build ok, 12 tests pass, core coverage 100% (threshold 80%).
2026-09-17 | P1 | npm pack -> npm i -g -> `delphi --version` = 0.1.0 and `delphi-team --version` = 0.1.0.
2026-09-17 | P1 | bun build --compile -> 83 MB Windows x64 binary, runs standalone, prints 0.1.0. Matches the 60-85 MB estimate from Phase 0.
2026-09-17 | P1 | Wheel built: delphi_team-0.1.0-py3-none-win_amd64.whl, Root-Is-Purelib: false, binary inside. pipx install -> `delphi --version` = 0.1.0.
2026-09-17 | P1 | PACKAGING_SPEC section 8 acceptance: npm and PyPI --version and --help output are byte-identical. Exit code propagates through the Windows shim.
2026-09-17 | P1 | ADR-0005 verified: with the binary removed, the shim refuses with exit 1 and an npm install hint instead of shelling out to npx.
2026-09-17 | P1 | sync-version --check proven to detect drift (exit 1), repair it, and return clean.
2026-09-17 | P1 | Uninstalled the pipx build afterwards so a frozen 0.1.0 binary cannot shadow development builds.
2026-09-17 | P1 | Read-only review found two real defects in the Python shim: a present-but-unrunnable binary raised an unhandled OSError traceback instead of the crafted message, and Ctrl+C on Windows surfaced as an uncaught KeyboardInterrupt. Both fixed; python/test_shim.py added (plain asserts, no framework) and wired into ci.yml.
2026-09-17 | P1 | Owner approved creating the public GitHub repository now, and splitting Phase 2 into three reported stages.
2026-09-17 | P1 | Public repo created at github.com/thaildhe172591/delphi-team and pushed. First CI run: 5 of 6 jobs green.
2026-09-17 | P1 | CI failure was real and useful: the unicode-path job checks out below the workspace root, so pnpm/action-setup found no package.json to read `packageManager` from. Fixed by pointing package_json_file at the checkout.
2026-09-17 | P2a | Core built: zod schemas (config, role, capability, team, story, board, project index), role build with marked blocks and the documented frontmatter precedence, ledger (paths, locking store, journal, board with transition rules), and the claude adapter.
2026-09-17 | P2a | The concurrency test earned its place twice: it found that the retry budget starved writers, and then that a retry-based file lock has no fairness at all. Fixed properly with an in-process queue (ADR-0008) rather than by raising retries.
2026-09-17 | P2a | 86 tests pass. packages/core coverage: statements 92%, branches 85%, functions 94%, lines 93% - all above the 80% threshold.
2026-09-17 | P2a | CI caught two real defects the local run could not. (1) execa 10 and commander 15 both require Node >= 22, silently breaking the `engines: >=20` floor the spec fixes; the node-20 job failed with `TEXT_ENCODINGS.union is not a function`. Pinned execa ^9.6.1 and commander ^14.0.3, which are the newest lines that still support Node 20. (2) The adapter test asserted `claude` was on PATH, which no CI runner has; it now spawns node as a stand-in to exercise the same code, and the real-Claude check reports a skip instead of failing.
2026-09-17 | P2b | PROTOCOL.md written: 96 lines, all 12 mandatory sections (ORCHESTRATION_SPEC section 11 caps it at 150).
2026-09-17 | P2b | All templates written: 10 standard roles, 5 optional roles, 8 capability packs (including the Pythia pack filled from the real install), 5 team templates, PROTOCOL.md, 9 ledger templates, 4 artifact templates, and the commented sample config. 43 files.
2026-09-17 | P2b | Templates are embedded into a generated TypeScript module rather than read from disk, because a bun-compiled binary has no template directory. One mechanism serves npm, the wheels and the plugin. The generated file is committed and CI fails when it is stale - proven to bite.
2026-09-17 | P2b | The template test suite found two real defects the type checker could not: an unquoted colon in the reviewer description broke its YAML frontmatter outright, and db-engineer and reviewer were each missing a section ROLES_SPEC section 1 requires. Both fixed.
2026-09-17 | P2b | 186 tests pass. Every shipped template is parsed and validated, every role is checked for its nine sections, its length, and that it pins no model; every capability for its guard rails and evidence section; every team for real seats and a sane active limit; and every template is swept for anything that suggests bypassing permissions.
2026-09-17 | P2b | Owner raised the Node floor to >=22 (ADR-0009), so execa and commander return to their current releases and the CI floor job now guards Node 22. The spec line in WORKFLOW section 2 is annotated in place rather than silently rewritten.
2026-09-17 | P2c | CLI built: init, doctor, role/capability/team, project/resume/state/journal/checkpoint, story/task/report, seat/start/dispatch/snap, hook. Judgement lives in core as pure functions; the CLI gathers facts and prints.
2026-09-17 | P2c | Three defects found by running it rather than by reading it. (1) commander `.command()` returns the subcommand, so `story` and `team` were never registered and their children leaked to the top level. (2) proper-lockfile is CommonJS and was bundled into the ESM output because the CLI did not declare core dependencies, so the binary died on its first require(). (3) A hook payload cwd that Node cannot resolve made SessionStart inject nothing, silently. All three now have tests.
2026-09-17 | P2c | Dogfooded: `delphi init` on this repository, then a real project ledger with the remaining phases as stories. init is idempotent, doctor reports clean, and the board gates refuse `ready` without acceptance criteria and `done` without a report.
2026-09-17 | P2c | 244 tests pass.
2026-09-17 | P2c | CI found an ordering bug the local machine hid: `pnpm check` ran typecheck before build, so the CLI typechecked against core generated .d.ts files that do not exist on a clean checkout. Locally a stale dist masked it. The order is now lint -> build -> typecheck -> test, and it was verified from no dist at all.
2026-09-17 | P3a | Dispatch decisions moved into core as pure functions: choosing a mode from the environment, and planning which seats start. The pre-spawn checks refuse two stories claiming the same files, two seats owning one path, a story with no acceptance criteria, and more active seats than the team can coordinate.
2026-09-17 | P3a | Commands added: dept up/status/down, shift end, handoff new/list, inbox, next.
2026-09-17 | P3a | Two defects found by running it. A story with a bare `handoff_to:` parsed as null and failed the whole schema, and the CLI then reported "no acceptance criteria" - the symptom, not the cause. Making the reader say what was actually wrong then exposed the real root cause underneath: YAML turns an unquoted ISO timestamp into a Date, which the schema rejected. Every story would have hit it. Fixed in the schema, which fixes it for every reader.
2026-09-17 | P3a | Spike script written for the owner to run: scripts/spike-agent-teams.mjs. Agent Teams needs an interactive CLI session, so it cannot be driven from a tool call.
2026-09-17 | P3a | 276 tests pass.
2026-09-17 | P3b | Terminal surfaces added: one wt invocation with panes chained by a bare `;`, or a tmux session created, filled, tiled and attached. Built as data rather than executed directly, so `dept up --surface` prints the exact command first - it opens windows on someone screen and the wt form has not been run end to end.
2026-09-17 | P3b | `delphi watch` added: read-only, board and live seats side by side so a disagreement between them is visible. `--follow` redraws without pulling in a dependency.
