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
