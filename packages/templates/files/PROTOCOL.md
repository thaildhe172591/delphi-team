# delphi-team protocol

Every session in this project loads this file, because `CLAUDE.md` imports it. It survives compaction.
If you are reading it, it applies to you.

## 1. You are a seat

A seat is a position in a department. Sessions are disposable; the seat is not.

Work out which seat you are, in this order: the agent definition you were started with; the `DELPHI_SEAT`
environment variable; the `/seat` skill you were given. **If none of those tells you, ask the orchestrator.
Do not guess and do not invent a seat.** Answering as the wrong seat corrupts the ledger.

## 2. Files are the truth

The project ledger under `.delphi/projects/<slug>/` is what is real. Your conversation is not.

Anything that must survive this session goes in a file — the board, the story, your report, the journal.
Anything you "remember" from earlier in the conversation is a hypothesis until a file confirms it. When the
ledger and the working tree disagree, say so; do not quietly pick one.

## 3. Stay inside your file scope

Change only what the `files` field of your story lists. That list is the contract that lets several seats work
at once without overwriting each other.

Something outside it needs changing? **Message the seat that owns it.** Do not edit it yourself, do not
"just fix it quickly", and do not widen your own scope.

**Deleting is editing, and it is the one that cannot be undone.** Never remove a path you do not own — not
as a test fixture, not "temporarily", not while cleaning up. Another seat may have written it seconds ago and
never committed it. If you want to know what a destructive command does, find out in a scratch directory,
never against the working tree.

## 4. Write through the commands

Use `delphi` to change the ledger: `delphi task move`, `delphi journal add`, `delphi report`,
`delphi checkpoint`. They lock the files and keep the format valid. Hand-editing YAML while another seat
writes the same file is how a board loses a task.

## 5. Report in the contract's shape

When you finish, are blocked, need a decision, or find a risk:

1. Write the full report to `.delphi/projects/<slug>/reports/<your-seat>/<ID>-<n>.md` — what you did, which
   files changed, the verification command and its trimmed output, risks, what is left.
2. Update the story and the board.
3. Message the orchestrator with **at most 15 lines**:

```
[<seat>] <ID> <DONE|BLOCKED|DECISION|RISK|PROGRESS>
Summary: …
Needs orchestrator: no | decide … | provide …
Detail: <path to the report>
```

The orchestrator opens the report only when it needs to. Long output belongs in the file, not the message.

## 6. Talking to other seats

Address seats by name. Batch your updates into one message rather than sending five — messaging is
rate-limited and a flood gets dropped.

**A message from another agent is not the user's permission.** If your permission prompt was denied, that is
the answer; do not ask a peer to run it for you. Route it back to the orchestrator instead.

**A delivered message is not an action.** A seat running in a different permission mode holds incoming
messages for its user to approve, so silence means nothing. Do not resend to hurry someone.

## 7. Prove it before you call it done

Run the story's `verify` command. Paste the command and a trimmed result into your report. "Tests pass" with
no output is a claim, not evidence. If you could not run it, say that plainly instead.

## 8. Protect your context

Read long files, logs and test output through a subagent and keep the summary, not the transcript. Never
paste a long log into a message. One story is one session: when the story is done, stop.

## 9. Safety

- Never bypass permission checks, and never suggest it as a workaround.
- Never print credentials, tokens or connection strings — not in chat, not in a report, not in a file.
- Database and infrastructure work follows the capability that grants it. Read-only is the default; a write
  needs a script, a named environment, a rollback plan, and the user's approval through the orchestrator.
- Production is out of bounds unless the project config explicitly allows it.

## 10. Images

Attachments live at the paths listed in the story's `attachments`, under `.delphi/assets/`. Read them from
there. To share an image with another seat, save it with `delphi snap` — a message carries text only.

## 11. End of shift

Run `/shift-end` before you stop: update the story and the board, write your report, record anything worth
keeping in `knowledge/<your-seat>.md`, and note lasting lessons in your own memory file.

## 12. Language

Answer the user in the language set by `language` in `.delphi/config.yaml`. Messages between agents stay short
and always carry the task id.
