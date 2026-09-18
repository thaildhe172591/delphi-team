# Writing a role, or a capability

Two ways to teach delphi a job it does not know yet. Pick by how much of the job is new.

- A **role** is a seat: an identity, a scope, files it owns, and how it reports. `researcher` and
  `editor` are roles.
- A **capability** is something a seat can also do, merged into a role at build time. `pythia-oracle`
  is a capability — it does not deserve a seat, it deserves to be a thing the backend developer can
  also do.

**Ask first whether it needs to exist.** A seat is a session, and a session is quota. If the work is
a variation on something a standard role already does, widen that role's `owns` in your config
instead. Most "we need a new seat" turns out to be "the story was not specific enough".

---

## A role

One markdown file at `packages/templates/files/roles/<name>.md`, or in `roles/optional/` if it is
not part of every department.

```markdown
---
name: researcher
description: One sentence. It is what the orchestrator reads when deciding whether this seat is the one.
memory: project
color: purple
---

## 1. Identity
## 2. Scope
## 3. Artifacts you own
## 4. Inputs and outputs
## 5. Startup
## 6. Workflow
## 7. Definition of done
## 8. Reporting
## 9. End of shift
```

The section headings are not decoration — `doctor` checks for them, and a seat that is missing
**Startup** does not know what to read before it begins.

### What makes a role work, from the ones that did

- **Say what it must not do, and why.** `## 2. Scope` has a DON'T list in every shipped role. The
  useful ones name a specific failure: the tech lead's is *"don't take over a story you assigned"*,
  because that is what actually happens.
- **Give it one sentence that decides.** Every good role has a line of the form *"You succeed
  when…"*. It is what the seat falls back on when the story does not cover the case in front of it.
- **Owning nothing is a design.** The `editor` role owns no files on purpose: a reviewer that can
  rewrite the draft stops reviewing it. If that is the point of your role, say so in the file.
- **A description with a colon breaks the frontmatter.** YAML reads `description: Reviewer: reads
  code` as a nested map and the whole file silently fails to parse. Reword it.
- **Write it for a session starting cold.** The seat has never seen this project. Anything you leave
  implicit, it will guess.

Then: `delphi role build --all`, and `delphi doctor` to check what you wrote is loadable.

## A capability

One markdown file at `packages/templates/files/capabilities/<name>.md`.

```markdown
---
id: pythia-oracle
title: Oracle through Pythia
version: 1
applies_to: [dev-be, techlead, db-engineer]
requires:
  tools: [Bash]
  commands: [pythia]
risk: high
---

## What this adds
## When to use it
## Using the tool
## Safety rails
## Evidence to include in your report
```

`applies_to` is the honest part: a capability that says it applies to every seat has not been thought
about. `requires` is checked by `doctor`, so a seat is never composed with a capability whose tool is
not installed.

**Anything with `risk: high` needs a Safety rails section that says what is refused, not what is
allowed.** The Oracle capability is read-only by default and every write is a script, a named
environment, a rollback and an approval — in that order. Copy that shape.

## Trying it before you send it

```bash
pnpm check                        # lint, build, typecheck, tests
delphi role build --all           # compose the seats
delphi doctor                     # is what you wrote loadable
delphi seat <name>                # exactly what that seat starts with
```

The last one is the real test. Read what the seat is handed and ask whether *you* could do the job
from it.

## Sending it

A role or capability that is genuinely general is welcome in the templates. One that is specific to
your company belongs in your own project — `.delphi/config.yaml` composes seats from a base role plus
capabilities plus what they own, and nothing has to be upstreamed for that to work.

Please include what you learned using it. A role file that has never run is a guess about a job, and
the ones that shipped here all changed after the first real session.
