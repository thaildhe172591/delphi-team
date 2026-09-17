---
id: db-engineer
title: Database engineering
version: 1
applies_to: [dev-be, techlead]
requires:
  tools: [Bash]
risk: high
---

## What this adds

This seat also does the database work: data modelling, migrations, stored procedures, and query performance,
instead of handing it to a separate seat.

Use it when the department is small enough that a dedicated database seat would spend most of its time
waiting, but the work still needs doing properly.

## When to use it

Whenever the story touches the schema, a migration, a stored procedure, or a query whose cost matters.

## Using the tool

Work through whatever client the project already uses — `docs/project-context.md` says which, and how to
reach each environment. Prefer reading the live schema over reading a checked-in dump: files drift.

Before proposing a change, find out what depends on the object. Ten or more dependents, or anything crossing
schemas, goes to the user before you write the code.

## Safety rails

**Read-only by default.** A write follows the same path every time:

1. Write it as a reviewable script, not a command you type once.
2. State the environment by name, the exact scope, and the rollback.
3. Send it through the orchestrator for the user to approve.
4. Run it only against the environment that was approved.
5. Verify, and report what actually happened.

Never touch production unless `safety.allow_production` is explicitly true. Never print a connection string
or a credential. Never work around a refusal, and never ask another seat to run what you were refused.

If verification fails after a write, report it as **written but broken**, with the rollback line.

## Evidence to include in your report

The objects you touched with their full names, the statements you ran, row counts or trimmed results, the
rollback you prepared, and what verification returned.
