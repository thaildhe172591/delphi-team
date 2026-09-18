# delphi-team documentation

**English** · [Tiếng Việt](README.vi.md)

Run Claude Code as a department: one orchestrator you talk to, and specialist seats — BA, PM, tech
lead, backend, frontend, DB, QA, tester, reviewer — each with its own role, memory and file scope.

> Unofficial. Works with Claude Code; not affiliated with or endorsed by Anthropic.
> **Pre-alpha, not published.** Everything here runs from a source build.

## Start here

| | |
|---|---|
| [**Guide**](guide.md) · [vi](guide.vi.md) | How delphi works and how to work with it: the model, the ledger, a shift end to end |
| [**Trying it**](try-it.md) | A walk through the tool in the order that makes sense to run it, with every command marked free or quota-spending |
| [**Example departments**](../examples/README.md) | The three packs — solo developer, software team, content team — and how to apply one |
| [**Writing a role**](writing-a-role.md) | Teaching delphi a job it does not know yet, and when not to |
| [**Releasing**](releasing.md) | How a version reaches npm and PyPI, and the one-time setup only you can do |

## The idea

A **seat** outlives the session that fills it.

Working across several Claude Code sessions, one per role, the role is the fragile part. It lives in
a prompt you retype for every new session, and it evaporates on resume, on `/clear`, on compaction,
or when a session is renamed. So you become the messenger between your own sessions, re-explaining
context that a file should have held.

- Identity, scope and rules live in a generated agent definition, not in a prompt you retype.
- Work state lives in a project ledger on disk — brief, state, journal, decisions, board, stories,
  reports.
- The conversation is disposable. Tomorrow's session reads the ledger and carries on.
- You talk to the orchestrator. It forms the department, hands out the work, and brings you decisions.

## How it is built

| | |
|---|---|
| [**What was verified**](research/claude-code-capabilities.md) | Every Claude Code feature delphi relies on, with its source |
| [**Where the spec met reality**](../.build/CONFLICTS.md) | Eighteen places the tool does something other than the spec assumed, and what was built instead |
| [**Traceability**](traceability.md) | Each of the 25 requirements, where it is met, and the three that are not |
| [**Picking up the build**](../.build/HANDOFF.md) | Full context for a session starting cold: the rules, the state, and every trap already paid for |

The specification it was built from is in [`spec/`](spec/) — nine documents, in Vietnamese, which
decide the design. Where the tool disagreed with them, reality won and the disagreement was written
down rather than hidden.

## Safety, briefly

- No `--dangerously-skip-permissions`, ever, and no suggesting it as a workaround.
- No `postinstall`, no telemetry, no writing over your config without a flag, a dry run and a diff.
- Database access is read-only by default; a write needs a script, a named environment, a rollback
  and your approval.
- `delphi watch --web` serves `GET` only, binds to 127.0.0.1, and checks the `Host` header.
- The one command that spends quota on its own, `delphi loop`, does nothing without `--yes` and
  prints its ceiling in sessions first.
