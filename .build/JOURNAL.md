# BUILD JOURNAL

2026-09-17 | setup | Read all 9 spec files in docs/spec/ (1315 lines). Duplicate copy confirmed byte-identical.
2026-09-17 | setup | Owner decisions: rename folder to delphi-team; move spec to docs/spec/ + delete duplicate; survey local Pythia install after updating it to latest.
2026-09-17 | setup | Folder renamed pythia-agents-team -> delphi-team. `git init` done. `.build/` created.
2026-09-17 | P0 | Toolchain verified: claude 2.1.274, node 22.16.0, pnpm 10.33.2, git 2.54.0, uv 0.11.23, wt present, tmux + pipx absent.
2026-09-17 | P0 | `claude --help` confirms --agent/--agents/--bg/--model/--effort/--name/--resume/--autocompact/--worktree/--tmux/--permission-mode and subcommands agents|attach|logs|stop|rm|respawn|doctor|plugin|mcp.
2026-09-17 | P0 | `claude agents --help` confirms `--json` (active sessions, no TTY needed), `--all` (include completed), `--cwd` filter.
2026-09-17 | P0 | `~/.claude/keybindings.json` does not exist -> Alt+V binding is at product default, needs doc confirmation.
