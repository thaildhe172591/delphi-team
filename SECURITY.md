# Security

## Reporting a vulnerability

Please report security issues privately through GitHub's **Report a vulnerability** button on the Security tab,
rather than opening a public issue. Include what you did, what happened, and what you expected. We will acknowledge
the report and keep you updated while a fix is prepared.

## What this tool does, and does not do

delphi-team orchestrates Claude Code sessions on your own machine. It is worth being precise about the boundaries.

**It does not:**

- bypass Claude Code's permission system, or default to any mode that does;
- run install scripts — the published packages have no `postinstall` and download nothing at install time;
- send telemetry, or transmit your project anywhere;
- modify your global configuration without an explicit flag, a dry run and a diff;
- print credentials or connection strings.

**It does:**

- write files inside your project (`.claude/`, `.delphi/`, `docs/`) and read your project ledger;
- start and stop Claude Code sessions on your machine at your instruction;
- install hooks that log to `.delphi/logs/`.

## Trust boundaries worth understanding

**Hooks are not a security boundary.** delphi's hooks are quality gates and an audit trail. Claude Code's hook
contract fails open — a hook that errors or times out lets the action proceed, and only a specific exit code
blocks. The permission system is the boundary; our hooks are a seatbelt, not a lock.

**A message between sessions is not consent.** Agents can message each other, and a message can ask for anything.
It never substitutes for your approval. Seats are instructed never to ask another seat to do something their own
permissions refused, and never to treat a delivered message as agreement.

**Database access is read-only by default.** Any capability that can write to a database must produce a script,
state the environment and the rollback, and obtain your approval through the orchestrator first.

## Supported versions

Pre-alpha: only the latest release is supported.
