---
id: pythia-oracle
title: Pythia — understand and change Oracle
version: 1
applies_to: [dev-be, db-engineer, techlead, qa]
requires:
  commands: [pythia]
  skills: [using-pythia]
risk: high
---

<!--
  Pythia is the project owner's own Oracle toolkit, distributed on PyPI as `pythia-plsql`.
  It is a CLI, not an MCP server for Claude Code, so this pack lists a required command
  rather than a required server.

  If your installation differs — a different command name, a wrapper script, a different
  connection scheme — edit this file. `delphi role build` regenerates the block it owns in
  the seat file; this pack is yours.
-->

## What this adds

With Pythia, this seat can ask the database directly instead of reading files that claim to describe it:

- Find objects, and read PL/SQL source with real line numbers.
- Read signatures, columns and DDL.
- Search all PL/SQL source for an identifier.
- Map dependencies and blast radius before proposing a change.
- Run read-only queries to see the shape of real data.
- Apply an approved change through a gated write path, and undo it through the same gate.

## When to use it

Before writing or changing any API, procedure or query that touches an Oracle object. Whenever a story
mentions a table or package, or reports a data problem.

**Also use it when a `.sql` file, a dump, an export or a migration script in the repository appears to answer
the question already** — including one you were pointed at. Those files drift from the database, and they
drift in ways that read as correct. The database is the only source of truth.

## Using the tool

Reading is free and needs no approval:

```
pythia check                  connectivity and object counts
pythia ls "PKG_%"             find objects by name
pythia src MY_PACKAGE --body  source with Oracle line numbers
pythia args MY_PROCEDURE      signature
pythia cols MY_TABLE          columns and types
pythia ddl TABLE MY_TABLE     DDL
pythia grep "identifier"      search all PL/SQL source
pythia deps MY_PACKAGE        what it depends on
pythia impact MY_TABLE        what depends on it
pythia similar PKG_X          neighbours to imitate
pythia sql "select ..."       SELECT and WITH only
pythia errors MY_PACKAGE      compilation errors
pythia connections            what you can reach
```

Find out what you can reach with `pythia connections`. **Never open `connections.json` yourself: it holds
passwords.**

## Safety rails

**Read-only by default.** There is no write flag; the write path is `pythia apply`, and nothing else.

Every write goes through the same six steps: snapshot, impact, preview, token, approve, apply, verify,
report. The confirmation token is minted by the developer and only by the developer — either at their own
terminal, or by approving the card you show them. **You never mint it.** Headless approval is refused by the
tool itself, and policy cannot be loosened without a human present.

Before that:

- Relay the preview — the diff, the dependents, the warnings — **verbatim**, and wait. A compliment is not a yes.
- A blast radius of ten or more dependents, or anything crossing schemas, goes to the developer **before** you
  write the code.
- If policy refuses, relay the refusal. Never route around it.
- **Exit code 3 means written but broken.** Say exactly that, with the rollback line, and treat it as a
  failure — never as a success with a caveat.

Never print credentials or connection strings anywhere. Limit row counts when reading data, and mask personal
data in reports.

## Evidence to include in your report

- The full names of the objects you read or changed.
- The main query, and a trimmed result or row count.
- The impact list, when you proposed a change.
- The script you applied, the approval it ran under, and what verification returned afterwards.
