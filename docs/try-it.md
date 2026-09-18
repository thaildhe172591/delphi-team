# Trying delphi-team on the Claude CLI

A walk through the tool as it stands at the end of Phase 5, in the order that makes sense to run
it. **Commands are marked 🟢 free or 🔴 spends quota.** Nothing 🟢 ever starts a Claude session.

Pre-alpha: nothing is published yet, so everything runs from a source build.

---

## 0. Build it

```bash
corepack enable
pnpm install
pnpm check
```

`pnpm check` is lint → build → typecheck → 357 tests. If it is green, the build is sound.

Then either put the CLI on PATH:

```bash
cd packages/cli && npm link
```

or call it directly, which is what the rest of this guide assumes:

```bash
node packages/cli/dist/index.js --help
```

Set an alias to save typing:

```bash
alias delphi="node $PWD/packages/cli/dist/index.js"
```

You also need `claude` on PATH and logged in:

```bash
claude --version
claude auth login
```

---

## 1. Set a project up 🟢

delphi needs a git repository — it refuses to initialise outside one, so a stray `delphi init`
in your home directory cannot happen.

```bash
mkdir demo && cd demo && git init
delphi init --yes
delphi doctor
```

`init` writes `.delphi/` (config, protocol, roles, teams, capabilities), `.claude/agents/*.md`
(one agent definition per seat), the hooks, and a `CLAUDE.md` that imports the protocol.

`doctor` checks the setup and scores it. Warnings are things worth knowing, not failures — for
example it will tell you if your orchestrator model bills to usage credits.

**Look at what it generated:** `.claude/agents/orchestrator.md` is the seat definition Claude Code
loads. `.delphi/PROTOCOL.md` is what every session in the project reads, because `CLAUDE.md`
imports it and an import survives compaction.

## 2. Make some work 🟢

```bash
delphi project new shop --title "Order checkout"
delphi story new T-001 --title "Add a health endpoint" --owner dev-be --project shop
```

Open `.delphi/projects/shop/stories/T-001.md` and fill in the frontmatter. These four fields are
the contract, and the board refuses to move a story to `ready` without them:

```yaml
files: ["src/health.ts"]          # globs this story owns; nothing outside may be edited
deliverables: ["src/health.ts"]
acceptance: ["GET /health returns 200"]   # statements someone could check
verify: "npm test"                # the command that proves it
```

```bash
delphi task move T-001 ready --project shop
delphi task list --project shop
delphi next
```

Try breaking the rules — the refusals are the interesting part:

```bash
delphi task move T-001 done --project shop      # refused: ready cannot jump to done
delphi task move T-001 blocked --project shop   # refused: blocked needs a reason
```

The first is refused by the transition rule — from `ready` a task can only go to `doing`,
`backlog`, `blocked` or `cancelled`. The report rule bites one step later: a task in `review`
cannot reach `done` without a report carrying the verify command's output.

## 3. See what a dispatch would be, without dispatching 🟢

```bash
delphi dept up --project shop --dry-run
```

This prints the mode it chose and why, who would start, who is held back and why, and the exact
prompt each seat would receive. It also runs the pre-flight checks: two seats owning one path,
two stories claiming one file, a story with no acceptance criteria — all block the dispatch.

```bash
delphi dispatch dev-be T-001 --project shop --dry-run
delphi seat dev-be shop          # the package a seat needs to start, for pasting into Desktop
```

## 4. The loop, without spending anything 🟢

`delphi loop` is the only command that starts sessions on its own. Run it bare and it spends
nothing — it prints the ceiling, the first seat it would start, and the exact prompt:

```bash
delphi loop --project shop
```

Read the ceiling line. `--max-stories × --max-attempts` (default 1 × 3) is the most `claude` runs
it can ever start, and that bound is tested, not asserted.

To watch the whole machine work — dev, review, every stop condition — against a stand-in binary
that costs nothing, from the delphi-team repository:

```bash
node scripts/loop-lab.mjs
```

That builds a scratch project in a temp directory and runs five cases: a full cycle, a seat
reporting BLOCKED, a seat stuck on a permission prompt, a story that never moves, and a story the
board blocks. Each one should stop, and stop for the stated reason.

## 5. The MCP server 🟢

Eight ledger tools a seat can call instead of typing shell commands. Same core, same file locks,
same refusals — different door.

```bash
delphi mcp                        # speaks JSON-RPC on stdin/stdout; Ctrl+C to stop
```

To register it for a project:

```bash
claude mcp add delphi --scope project -- delphi mcp
claude mcp list
```

It will show as **pending approval** — that is correct. A project-scoped `.mcp.json` is a file
anyone could commit, so Claude Code makes you approve it before the tools are live.

To check it by hand without Claude Code:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | delphi mcp
```

## 6. The VS Code companion 🟢

Not on the marketplace yet. To run it from source, open the delphi-team repository in VS Code and
press **F5** (Extension Development Host), then open your `demo` folder in that new window.

Or install the built extension into your own VS Code:

```bash
pnpm --filter delphi-team-vscode build
npx @vscode/vsce package --no-dependencies    # in packages/vscode
code --install-extension delphi-team-0.1.0.vsix
```

It activates only where `.delphi/config.yaml` exists. You get the board in the status bar (amber
when something is blocked), **delphi: Open the department**, and **delphi: Watch the board**.

It starts nothing. `dept up` creates the seats; the extension shows them.

## 7. Watching 🟢

```bash
delphi watch                  # board and live seats side by side
delphi watch --follow         # redraws
delphi dept status --project shop
delphi cost                   # sessions delphi started — not money; see C-009
```

`dept status` tells you when a seat is stuck on a permission prompt, and how to reach it. That is
the failure mode that wastes a whole shift otherwise.

---

## 🔴 The parts that spend quota

Everything above is free. These start real Claude Code sessions and consume your plan's usage.

```bash
delphi dispatch dev-be T-001 --project shop     # one seat, one story, in the background
delphi dept up --project shop                   # the whole department
delphi loop --project shop --yes                # up to max-stories × max-attempts sessions
delphi meeting techlead qa --topic "..."        # several seats on one question
```

Each of these opens a pane per seat: `dispatch.surface` defaults to `auto`, which splits tmux
inside tmux, leaves the VS Code terminal to the companion extension, and splits Windows Terminal
otherwise. You keep your own pane and the seats stack beside it. `--surface none` turns it off.

The panes land in a Windows Terminal window, so run `claude` *from* Windows Terminal if you want
them to split the window you are already looking at.

Start with `delphi dispatch` on a single small story. It is one session, it is named, and
`delphi dept down` stops everything delphi started.

`delphi loop --yes` is the one to be careful with. Run it without `--yes` first and read what it
says it will do. It stops on its own when: the story limit is reached, a story has cost its
attempt limit, a seat reports BLOCKED/DECISION/RISK, a seat waits on a permission prompt, or a
seat has not finished within `--step-timeout` (20 minutes by default).

---

## If something does not work

- **`error: not inside a project`** — you are outside a git repository, or you have not run
  `delphi init`.
- **A dispatch fails mentioning a line break and `cmd.exe`** — you are on a build from before
  C-017. Update: the adapter resolves the Windows `.cmd` shim to the real `.exe`.
- **`delphi` is not found after `npm link`** — use the `node packages/cli/dist/index.js` form, or
  point `delphi.delphiPath` in the VS Code settings at it.
- **`claude` is not on PATH** — set `DELPHI_CLAUDE_BIN` to its full path.
- **Every command is slow the first time** — `claude agents --json` is being asked what is
  running; that is one process spawn.

Everything delphi does to the ledger is a file. If a command surprises you, look at
`.delphi/projects/<slug>/` — the board, the journal and the reports are plain text, and they are
the truth.
