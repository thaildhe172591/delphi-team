# delphi-team

The delphi-team roles, protocol and skills as a Claude Code plugin.

## What you get

- Agent definitions for every seat: orchestrator, BA, PM, tech lead, backend, frontend, database, QA,
  tester, reviewer, and the optional ones.
- The skills that drive them: `/delphi-dept`, `/delphi-resume`, `/delphi-seat`, `/delphi-role`, `/delphi-shift-end`, `/delphi-checkpoint`.
- `PROTOCOL.md`, the rules every seat follows.

## What you do not get

A plugin cannot do everything the CLI does, and it is better to know which:

- **Plugin-shipped agents ignore `hooks`, `mcpServers` and `permissionMode`.** That is a Claude Code
  rule, not a delphi one.
- **The hooks here call `delphi`.** Without the CLI installed they run, fail, and are logged —
  by design they never break your session, but they also do nothing.
- **The ledger is the CLI.** The project state, the board, the stories, the reports, the locking that lets
  several seats write at once — all of that is `delphi`, not this plugin.

So: use the plugin if you want the roles and the way of working. Install the CLI if you want the department.

## Installing

```
/plugin marketplace add <owner>/delphi-team
```

Then install the CLI alongside it:

```
npm install -g delphi-team
```
