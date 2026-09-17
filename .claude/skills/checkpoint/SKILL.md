---
name: checkpoint
description: Save a restore point for the project before compacting, before a large change, or at the end of a shift.
argument-hint: [note]
disable-model-invocation: true
---

# Checkpoint: $ARGUMENTS

A checkpoint is what a session opened next week reads to find out where things really stood.

```
delphi checkpoint --note "$ARGUMENTS"
```

That records STATE as it stands, the git HEAD and branch, and the sessions currently running.

## The part only you can write

The command captures the files. It cannot capture what is in your head, and that is the half that matters.

Add a resume note of **at most 30 lines** covering what is not in the ledger:

- the hypothesis you are currently following, and why
- what you already ruled out, so nobody repeats it
- what looked wrong but you did not chase
- the decision you were about to make, and what it hangs on

Write it as if to someone who knows the project but was not in this conversation. That is exactly who will
read it.

## When to run this

- At the end of a shift.
- Before you compact on purpose.
- Before a change large enough that you would want to go back.
- When the user asks.

Not on every turn. A checkpoint that says nothing new is noise in the folder.
