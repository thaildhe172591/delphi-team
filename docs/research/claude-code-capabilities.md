# Claude Code capabilities delphi-team depends on

Every feature this project builds on, with the official source that documents it.
Verified against **Claude Code 2.1.274** on **Windows 11 (native)**, 2026-09-17.
Docs base: `https://code.claude.com/docs/en/`.

Nothing in delphi-team may rely on behaviour that is not listed here. Items marked **unverified** have a
documented fallback; items marked **not supported** are designed around, never worked around.

---

## Seat identity

| Capability | Status | Source |
|---|---|---|
| A subagent definition at `.claude/agents/<name>.md` with YAML frontmatter | supported | `sub-agents` |
| Run a definition as the main session: `claude --agent <name>` | supported | `cli-reference` |
| Inline definitions without files: `claude --agents '<json>'` | supported | `cli-reference` |
| Per-agent model: frontmatter `model:` accepts `sonnet`/`opus`/`haiku`/`fable`/a full id/`inherit` | supported | `sub-agents#choose-a-model` |
| A session display name: `claude --name <name>` | supported | `cli-reference` |
| Persistent per-agent memory: frontmatter `memory: project` → `.claude/agent-memory/<name>/`, preloading the first 200 lines or 25 KB of `MEMORY.md` | supported, conditional | `sub-agents#enable-persistent-memory`, `memory#how-it-works` |
| …whether `memory:` applies when the definition runs as the **main** session or as a **teammate** | **unverified** | — |

> Fallback for the unverified row: every role body carries its own read/write instructions for its memory file,
> so a seat keeps its memory even where the frontmatter field does nothing. This is why role bodies, not
> frontmatter, hold every mandatory procedure.

## Protocol that survives compaction

| Capability | Status | Source |
|---|---|---|
| `@path` imports inside CLAUDE.md; relative to the importing file; recursion to 4 hops | supported | `memory#import-additional-files` |
| The project-root CLAUDE.md is re-read and re-injected after `/compact` | supported | `memory#instructions-seem-lost-after-compact` |
| Skills are re-attached after auto-compaction — most recent invocation each, first 5,000 tokens, shared 25,000-token budget | supported | `skills#skill-content-lifecycle` |

> This is why `PROTOCOL.md` is imported from CLAUDE.md rather than pasted into a skill, and why the `/seat` skill
> puts a seat's identity in its first lines.

## Hooks

| Capability | Status | Source |
|---|---|---|
| `SessionStart` with `source` ∈ `startup`, `resume`, `clear`, `compact`, `fork` | supported | `hooks#sessionstart` |
| Injecting context from `SessionStart` via `hookSpecificOutput.additionalContext` (or plain stdout) | supported | `hooks#add-context-for-claude` |
| Injected context over 10,000 characters is spilled to a file and replaced by a path plus preview | documented limit | `hooks#add-context-for-claude` |
| `PreCompact` with `trigger` and `custom_instructions`; can block, **cannot inject** | supported / not supported | `hooks#precompact` |
| `PreToolUse` denial via `permissionDecision: "deny"`; blocking exit code is **2** | supported | `hooks#pretooluse` |
| `SubagentStop` with `agent_id`, `agent_type`, `agent_transcript_path` | supported | `hooks#subagentstop` |
| `TaskCreated`, `TaskCompleted`, `TeammateIdle`, each able to block | supported | `hooks#taskcreated` |
| Fail-open: exit 1 and malformed stdout are non-blocking errors; only exit 2 blocks | supported | `hooks#exit-code-output` |
| Default handler timeout is 600 s (no documented maximum) | documented default | `hooks#configuration` |
| Settings-file hooks run inside subagents | supported | `hooks#hook-locations` |
| …whether they run for **teammates** | **unverified** | — |

> Because a timed-out `PreToolUse` hook does not gate and exit 1 fails open, delphi's hooks are quality gates and
> audit trails, never the security boundary. The permission system is the boundary.

## Department dispatch

### `teams` — Agent Teams

| Capability | Status | Source |
|---|---|---|
| Enabled by `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`; experimental, off by default, no settings key | supported | `agent-teams#enable-agent-teams` |
| Lead spawns a teammate by calling the Agent tool with a `name` | supported | `agent-teams#how-claude-starts-agent-teams` |
| Definition fields that reach a teammate: `tools`, `model`, body. `skills` never; `mcpServers` split-pane only | supported | `agent-teams#use-subagent-definitions-for-teammates` |
| Per-teammate **model** | supported | `agent-teams#specify-teammates-and-models` |
| Per-teammate **effort** | **not supported** — teammates inherit the lead's | `agent-teams#specify-teammates-and-models` |
| `teammateMode`: `in-process` (default), `auto`, `tmux`, `iterm2` | supported | `settings-reference#teammatemode` |
| `subagentPromptCacheTtl`: `"5m"` / `"1h"` | supported | `settings-reference#subagentpromptcachettl` |
| Mailbox at `~/.claude/teams/{team}/inboxes/{agent}.json`; `SendMessage`, `ListAgents` | supported | `agent-teams#architecture` |
| Shared task list (`TaskCreate`/`TaskGet`/`TaskList`/`TaskUpdate`) | supported, **conditional** — not available by default on Opus 5; needs `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` | `tools-reference#task-tool-availability` |
| Resuming teammates after the lead session ends | **not supported** | `agent-teams#limitations` |
| Agent Teams in Claude Desktop | **not supported** | `desktop` |
| Split-pane in VS Code's integrated terminal, Windows Terminal, Ghostty | **not supported** | `agent-teams` |

> Consequences designed in: the department is rebuilt from the project ledger each shift rather than resumed;
> a seat needing an effort level different from the orchestrator is dispatched as a background session instead;
> on Windows the practical teammate mode is `in-process`.

### `sessions` — background sessions

| Capability | Status | Source |
|---|---|---|
| `claude --bg` combined with `--agent`, `--model`, `--effort`, `--name` | supported | `cli-reference`, `agent-view` |
| `--bg` together with `-p/--print` | **not supported** | `headless` |
| Sessions survive closing the terminal (separate supervisor process) | supported | `agent-view` |
| `claude agents --json [--all]`: `cwd`, `kind`, `startedAt`, and `id`/`state` for background entries | supported | `agent-view` |
| A `model` or `agent` field in that JSON | **not supported** — delphi records these itself at dispatch time | `agent-view` |
| Agent view maturity | research preview | `agent-view` |
| Launching `claude --bg` from the Bash tool **inside** a running session | **unverified** | — |

> That last row is the assumption `sessions` mode rests on. Until it is settled by a live spike, `manual` mode is
> the guaranteed path and `dispatch.mode: auto` falls through to it.

### `manual` — Claude Desktop and the VS Code extension

| Capability | Status | Source |
|---|---|---|
| Cross-session messaging via `ListAgents` and `SendMessage` | supported | `cross-session-messaging` |
| Transport: per-session named pipe on native Windows; never via Anthropic servers | supported | `cross-session-messaging` |
| Reach: same OS user, same filesystem view. **WSL 2 and native Windows sessions on one PC cannot reach each other** | documented limit | `cross-session-messaging#message-sessions-on-other-machines` |
| `notify_when_idle` — an input on `SendMessage`; one-shot, same machine, main conversation only, 12 h expiry | supported | `cross-session-messaging#get-a-notice-when-another-session-goes-idle` |
| Inbound control `crossSessionInbound`: `accept` / `hold` / `refuse` | supported | `cross-session-messaging#control-inbound-messages` |
| Limits: ~1,000,000 char cap, sender-side burst refusal, receiver queues at most 50, repeats dropped | documented limits | `cross-session-messaging#limitations` |
| Whether a **VS Code extension** session binds an inbox | **unverified** | — |

## Images (Windows workflow)

| Capability | Status | Source |
|---|---|---|
| Paste an image from the clipboard in the CLI: action `chat:imagePaste`, default **Alt+V on Windows and WSL** | supported | `keybindings` |
| Custom bindings at `~/.claude/keybindings.json`, hot-reloaded | supported | `keybindings` |
| The Read tool returns PNG/JPG by path as visual content | supported | `tools-reference` |

## Context and cost

| Capability | Status | Source |
|---|---|---|
| `--autocompact <auto\|tokens>` and the `autoCompactWindow` setting (100k–1M) | supported | `model-config#set-the-auto-compact-window` |
| Default auto-compact is a token boundary (~967K on native-1M models, 200K elsewhere), not a percentage | documented default | `model-config#default-auto-compact-thresholds` |
| Effort levels `low`, `medium`, `high`, `xhigh`, `max`; `xhigh` absent on Opus 4.6 / Sonnet 4.6 | supported | `model-config` |
| Fable can bill to usage credits depending on plan and seat tier; the consent prompt never appears in `-p`/SDK | documented behaviour | `model-config` |
| A stable local data source for historical per-session cost | **not available** | `claude-directory` (no schema, no stability statement) |

## Plugins

| Capability | Status | Source |
|---|---|---|
| `<root>/.claude-plugin/plugin.json`; every other directory at the plugin root | supported | `plugins-reference` |
| Plugin-shipped agents ignore `hooks`, `mcpServers`, `permissionMode` | documented limit | `plugins-reference` |
| `/plugin marketplace add <owner>/<repo>` with `.claude-plugin/marketplace.json` | supported | `plugin-marketplaces` |

---

## How to re-run this check

Capabilities move. Before trusting this file after a Claude Code upgrade:

```bash
claude --version
claude --help
claude agents --help
```

and re-read the pages listed above. `delphi doctor` enforces the minimum version this table was written against.
