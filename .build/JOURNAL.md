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
