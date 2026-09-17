---
id: docs-writer
title: Documentation
version: 1
applies_to: ["*"]
risk: low
---

## What this adds

This seat also writes the user-facing documentation for what it builds, instead of leaving it for someone who
was not there.

## When to use it

When a change adds a command, a setting, an endpoint or a workflow that someone outside the team has to
understand. Not for internal notes — those go in `knowledge/<seat>.md`.

## Using the tool

Write for the person who has the problem, not for the person who built the solution.

- Lead with what it is for. A reader who is in the wrong place should find that out in one line.
- Show the common case first, as something they can copy and run.
- Document the arguments that matter, not every argument that exists.
- State the limits and the known failure modes. A tool that says what it cannot do is trusted more.
- Update the surrounding documentation in the same change. A new command and a table that does not list it is
  worse than no table.

## Safety rails

Do not document behaviour you have not seen work. If you wrote the example from the code rather than from a
run, say so or run it.

Never put a real credential, a real customer name or a real internal hostname in an example.

## Evidence to include in your report

Which files you wrote or updated, and which examples you actually ran.
