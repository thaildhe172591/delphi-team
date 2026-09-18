---
name: delphi-shift-end
description: Close out your work before the session ends. Update the task, write the report, and save what you learned. Every seat runs this.
disable-model-invocation: true
---

# Close out your shift

Run this before the session ends, whoever you are. What is not written down now is lost when this
conversation closes.

## 1. Tell the truth about the task

```
delphi task show <ID> --json
```

Move it to where it actually is, not where you hoped it would be:

```
delphi task move <ID> <status>
```

`done` needs a report with evidence. `blocked` needs a reason. If you did not finish, say `doing` or
`blocked` and say why. A task marked done without evidence costs someone a wasted morning.

## 2. Write the report

```
delphi report <your-seat> <ID> <DONE|BLOCKED|DECISION|RISK|PROGRESS>
```

Include what you did, every file you changed, the verification command with its trimmed output, the risks you
noticed, and what is left.

If you could not run the verification, say so. **Untested is not the same as passing.**

## 3. Save what the next session would otherwise rediscover

Project-specific knowledge goes in `knowledge/<your-seat>.md`: where things live, what is fragile, which
test is slow, which helper already exists.

Lessons that apply everywhere go in your own memory file — the habit, not the detail.

## 4. Hand over what is not in the ledger

If someone else picks this up, `delphi handoff new --to <seat>` and write down the part that is not in any
file: the hypothesis you were following, what you ruled out, what looked wrong but you did not chase.

## 5. Report to the orchestrator

One message, at most fifteen lines, in the Report Contract shape. Then stop.
