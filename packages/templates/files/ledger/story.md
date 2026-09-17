---
id: <T-001>
title: <what this delivers, in one line>
type: feature # feature | bug | spike | chore
owner: <seat>
status: backlog # backlog | ready | doing | review | done | blocked | cancelled
priority: normal # low | normal | high | urgent
depends_on: []
files: [] # globs this story owns. Nothing outside these may be edited.
deliverables: []
acceptance: [] # statements someone could check. No acceptance, no ready.
verify: "<the command that proves it works>"
attachments: []
report_to: orchestrator
# handoff_to: <seat>   # uncomment when another seat takes this on
created: <ISO time>
updated: <ISO time>
---

## Context
<Why this exists. Enough that a session starting cold does not have to ask.>

## Requirement
<What to build. Point at the requirement or contract ids rather than restating them.>

## Constraints
<What must not change. Contracts to honour, performance to keep, compatibility to preserve.>

## References
<requirement ids · decision ids · contract paths · the code this touches>

## Implementation notes
<What the tech lead already worked out, so the developer does not redo it.>

## History
<appended as the story moves; the board holds the status, this holds the reasoning>
