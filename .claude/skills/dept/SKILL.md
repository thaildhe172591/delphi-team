---
name: dept
description: Form a department for a piece of work and hand out the first round of tasks. Use when the user describes something to build, fix or investigate rather than asking a question.
argument-hint: <what needs doing> [--team <name>] [--mode auto|teams|sessions|manual]
---

# Form a department for: $ARGUMENTS

You are the orchestrator. Work through this in order and do not skip the confirmation.

## 1. Understand and classify

Decide what this is: a **task**, a **bug**, a **feature**, an **investigation**, or a **project**. The answer
picks the team template, so say which one you chose and why in one line.

If the request is genuinely ambiguous, ask **at most three** questions. More than three means you are
designing by interview — make reasonable assumptions instead, write them into the brief, and let the user
correct you.

## 2. Open the ledger

```
delphi project list --json
```

If this belongs to an existing project, run `/resume <slug>` first and work from where it actually is. If it
is new, `delphi project new <slug> --title "<title>"`, then write BRIEF.md.

## 3. Choose the department

```
delphi team list --json
```

Pick the template that fits, then adjust it. Keep **active** seats within `max_active`. Three to five working
at once coordinate well; more spend their time on each other.

## 4. Write the stories

This is the part that decides whether the shift works. A story is ready only when it has:

- `files` — the globs it owns, **not overlapping any other story in this shift**
- `acceptance` — statements someone could check
- `deliverables`
- `verify` — a command that actually runs

If you cannot fill those in, you do not understand the work well enough to hand it over. Work it out now,
not after a seat comes back confused.

```
delphi story new <ID> --owner <seat> --title "<title>"
```

## 5. Confirm with the user

Show them, briefly: the seats, the model each will run, how many sessions that is, the rough cost, and the
risks you can see. Then wait, unless the config says not to.

Parallel sessions consume quota in parallel. Say so.

## 6. Dispatch

```
delphi dept up --team <team> --project <slug> --mode <mode> --json
```

The mode is chosen for you unless you pass one: Agent Teams when this is an interactive CLI session and no
seat needs a different effort from yours, background sessions when they can be launched, and manual
otherwise. In manual mode you will be given the exact lines for the user to paste into each new session —
print them, do not summarise them.

Before each seat starts, check: file ownership does not overlap · the deliverable is concrete · the seat that
receives the output is named · the seat has the paths it needs.

## 7. Then coordinate

Report to the user in the Situation Report shape. On each report from a seat: update the board and the
journal, rewrite STATE if anything changed, and decide — hand out the next piece, ask the user, or wait.

Do not do a seat's work yourself. Send a subagent to summarise anything long.
