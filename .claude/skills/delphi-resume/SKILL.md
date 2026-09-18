---
name: delphi-resume
description: Rebuild the picture of an ongoing project in a fresh orchestrator session, check it against reality, and report the situation. Use at the start of any session that continues yesterday work.
argument-hint: [project-slug]
---

# Rebuild the situation: $ARGUMENTS

A new session knows nothing. The ledger does. Work through this before doing anything else, and before
touching any code.

## 1. Pick the project

```
delphi resume $ARGUMENTS --json
```

If several projects are open and the user did not name one, ask. Do not guess: continuing the wrong project
is worse than one question.

That command returns the reconstruction package within a fixed token budget: the brief in summary, STATE, the
latest checkpoint, the recent decisions, the tasks that are not finished, and the tail of the journal.

**Read only that.** Not the code, not the full reports. The budget exists because a session that spends its
context rebuilding has none left to work with.

## 2. Check it against reality

The ledger records what seats *said*. Now find out what is actually true, and send a subagent so the detail
does not land in your context:

- git: HEAD, the branch, what changed since the last checkpoint, what is uncommitted
- for each task marked `doing` or `review`: have the files it claims actually changed
- run the `verify` command where it is cheap
- which sessions are still alive

Every mismatch is **drift**. Write it as "the ledger says X, the working tree says Y" — do not silently
prefer one.

## 3. Report the situation

```
Goal:            <one line>
Progress:        <n done · n in review · n in progress · n blocked>
Since last time: <what actually changed in the tree>
Drift:           <each mismatch, or "none">
Blocked:         <task · why · who is needed>
Needs you:       <question · options · your recommendation>
Next:            <up to five steps>
```

## 4. Wait

Do not dispatch until the user has seen the drift and confirmed — unless `resume.auto_continue` is true in
the config.

Then record it:

```
delphi journal add --event "session start · rehydrate · drift=<n>"
```
