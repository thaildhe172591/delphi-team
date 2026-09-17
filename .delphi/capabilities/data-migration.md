---
id: data-migration
title: Data migration
version: 1
applies_to: [db-engineer, dev-be, techlead]
requires:
  tools: [Bash]
risk: high
conflicts_with: []
---

## What this adds

This seat may move or reshape existing data, not just change the schema that holds it.

## When to use it

When a change needs existing rows rewritten, backfilled, split, merged or deleted — the part that cannot be
undone by reverting a deployment.

## Using the tool

Write every migration so that it can be run twice without doing damage. That single property removes most of
what goes wrong: a partial run, a retry, an unclear failure.

Structure it in three parts, and be able to run them separately:

1. **Expand** — add the new shape alongside the old one. Reversible.
2. **Backfill** — move the data, in batches, with a way to see progress and a way to stop.
3. **Contract** — remove the old shape, only once nothing reads it.

Measure how many rows you are about to touch before you touch them, and say the number out loud.

## Safety rails

Every migration needs **a backup that has been verified to exist**, a rollback, and a named environment. Not
a plan for a backup — a backup.

- Run it on a copy first, and report what happened there.
- Batch it. A single statement across a large table locks it and nobody can tell how far it got.
- Never run expand, backfill and contract in one irreversible step.
- Never touch production unless `safety.allow_production` is explicitly true, and then only with the user
  approving that specific run through the orchestrator.

If it fails halfway, report **written but broken**, say exactly how many rows were affected, and give the
rollback line. Do not attempt a clever repair before reporting.

## Evidence to include in your report

The row count before and after, the script, the environment name, where the backup is, the rollback, and the
verification query with its result.
