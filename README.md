# delphi-team

**Run Claude Code as a department.** One orchestrator you talk to, and specialist seats — BA, PM, tech lead,
backend, frontend, DB, QA, tester, reviewer — each with its own role, its own memory and its own scope.

> Unofficial. Works with Claude Code; not affiliated with or endorsed by Anthropic.

> **Status: pre-alpha, under construction.** The repository skeleton and the capability research are in place;
> the CLI currently does nothing but report its version. Follow `.build/STATE.md` for where the build is.

---

## The problem

Working across several Claude Code sessions, one per role, the role is the fragile part. It lives in a prompt you
retype for every new session, and it evaporates on resume, on `/clear`, on compaction, or when a session is renamed.
So you end up being the messenger between your own sessions, re-explaining context that a file should have held.

## The idea

A **seat** outlives the session that fills it.

- Identity, scope and rules live in a generated agent definition, not in a prompt you retype.
- Work state lives in a project ledger on disk — brief, state, journal, decisions, board, stories, reports.
- The conversation is disposable. Tomorrow's session reads the ledger and carries on.
- You talk to the orchestrator. It forms the department, hands out the work, and brings you decisions.

It is built on what Claude Code already ships — agent definitions, background sessions, agent teams, cross-session
messaging, hooks, skills, plugins — rather than reimplementing any of it. Every feature it leans on is recorded
with a source in [`docs/research/claude-code-capabilities.md`](docs/research/claude-code-capabilities.md).

## Install

Not published yet. When it is:

```bash
npm install -g delphi-team      # or: npx delphi-team init
pipx install delphi-team        # or: uvx delphi-team init
```

The PyPI wheels carry a compiled binary, so the Python install needs no Node. A platform with no published binary
says so and points at the npm install rather than quietly downloading a Node runtime.

Commands: `delphi-team` and `delphi`.

## Platform support

Windows native is the first-class target — Windows Terminal and PowerShell — with macOS, Linux and WSL 2 after it.

Some limits come from Claude Code itself and are worth knowing before you plan around them:

| Limit | Consequence |
|---|---|
| Agent Teams are CLI-only and not available in Claude Desktop | Desktop users drive seats through manual mode |
| Agent Teams split panes need tmux or iTerm2 | On Windows, teammates run in-process |
| Teammates share the lead's effort level | A seat that needs a different effort runs as a background session |
| Teammates are not restored on resume | The department is rebuilt each shift from the ledger — which is the intended rhythm anyway |
| WSL 2 and native Windows sessions cannot message each other | Pick one side and stay there |

## Related work

delphi-team learns from several projects without copying their prompts, templates or names. A proper comparison
table lands with the first release; the short version is that this one is small, file-first, needs no background
service, works from the CLI, the VS Code extension or Claude Desktop, and installs from either npm or PyPI.

## Documentation

| | |
|---|---|
| [`docs/spec/`](docs/spec/) | The full specification this repository is built from |
| [`docs/research/claude-code-capabilities.md`](docs/research/claude-code-capabilities.md) | Every Claude Code feature relied on, with its source |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | How to build, test and propose changes |
| [`SECURITY.md`](SECURITY.md) | Reporting a vulnerability, and the safety rules the tool holds itself to |

## Licence

MIT. See [LICENSE](LICENSE).
