---
id: perf-review
title: Performance review
version: 1
applies_to: [reviewer, techlead, dev-be, dev-fe]
requires:
  tools: [Bash]
risk: low
---

## What this adds

This seat judges the cost of a change, and can measure rather than guess.

## When to use it

On anything in a hot path, anything that touches a loop over data, and anything that adds a query, a network
call or a file read.

## Using the tool

Look for the failures that actually happen, in this order:

- **A query inside a loop.** The classic, and still the most common.
- **An unbounded read** — no limit, no pagination, no cap. Fine with the current data, fatal later.
- **Work repeated per item** that could be done once for the batch.
- **A missing index** for a predicate that now runs on every request.
- **Blocking work on a path that should return quickly.**
- **Front end**: a render in a loop, work that runs on every keystroke, an asset nobody needed.

Then measure. A number from a run beats a reading of the code, and the code reading is only there to tell you
what to measure.

## Safety rails

State the size of the data you measured against. A result from a hundred rows says nothing about a million,
and reporting it as if it does is worse than not measuring.

Do not optimise something nobody complained about and no number identified. Say "this is fine" when it is —
that is a useful review result.

## Evidence to include in your report

What you measured, the command and its output, the data size, and the before and after if you changed
anything.
