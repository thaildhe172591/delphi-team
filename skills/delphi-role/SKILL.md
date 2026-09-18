---
name: delphi-role
description: Change what a seat is, in words. Merge one role into another, add a capability, create a new seat, or change a model. Use when the user describes a change to a seat rather than to the work.
argument-hint: <what to change>
---

# Change a seat: $ARGUMENTS

Seats are composed, not written by hand: a base role, plus capability packs, plus the block of project notes
that belongs to the user. `delphi role build` regenerates the first two and never touches the third.

## 1. Work out what is being asked

| What the user says | What it means |
|---|---|
| let the backend dev do the database too | add the `db-engineer` capability to that seat |
| give the tech lead Pythia | add `pythia-oracle`, and check what it requires |
| make an OCR analyst role | a new seat, from the closest base role |
| the frontend dev must not touch the api folder | change that seat `owns` |
| put the tester on a cheaper model | change `models.tester` in the config |
| turn this procedure into a capability | a new capability pack from the template |

## 2. See what exists first

```
delphi role list --json
delphi capability list --json
```

## 3. Make the change, and show it before it lands

```
delphi role add <seat> --capability <id> --dry-run
delphi role build <seat> --dry-run
```

**Show the user the diff and wait.** A seat is how an agent behaves; changing it silently is how someone
ends up wondering why their reviewer started editing files.

Then run it without `--dry-run`.

## 4. Check what it needs

```
delphi doctor --json
```

A capability can require a command on PATH, an installed skill, or a configured MCP server. Doctor reports
what is missing. Say so plainly rather than letting a seat discover it mid-task — and remember a teammate
never receives skills from frontmatter, so those have to be configured at project or user level.

## 5. Record it and say who must restart

Record the change in DECISIONS, and commit it on its own.

**A running session does not pick up a changed role.** Tell the user exactly which seats need restarting for
the change to take effect. `delphi role revert <seat>` undoes it.
