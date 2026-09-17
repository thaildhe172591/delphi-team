# delphi-team for VS Code

A window onto a delphi department that the CLI is running. Unofficial; works with Claude Code.

It starts nothing and changes nothing. `delphi dept up` creates the seats; this shows them.

## What it does

- **The board, in the status bar.** `demo: 4 open · 1 blocked`, updated as the ledger changes.
  It turns amber when something is blocked, because blocked work is the thing worth
  interrupting someone for.
- **`delphi: Open the department`** — one editor terminal per seat that is actually running,
  in columns. Each terminal *is* the session (`claude attach <id>` as its own process), so
  the pane closes when the seat does.
- **`delphi: Watch the board`** — `delphi watch --follow` beside your code.
- **A nudge when a department starts.** New seats in `sessions.log` produce one notification
  with an *Open them* button. Nothing opens by itself.

## How it knows

The ledger, and only the ledger. There is no channel from the CLI to VS Code: `sessions.log`
is written by whoever started the seats, and this watches it. A second channel is a second
thing that can disagree with the board.

Sessions are joined against `claude agents --json` before any pane opens, because a log line
records that a session *was* started, not that it still exists.

## Settings

| Setting | Default | For |
|---|---|---|
| `delphi.claudePath` | `claude` | when `claude` is not on PATH |
| `delphi.delphiPath` | `delphi` | when `delphi` is not on PATH |
| `delphi.notifyOnDispatch` | `true` | the nudge when a department starts |

## Requirements

A workspace with a `.delphi/config.yaml` — that is, one where you have run `delphi init`.
The extension does not activate anywhere else.
