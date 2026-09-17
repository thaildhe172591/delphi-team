## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## Why

<!-- What problem it solves. If it changes a decision recorded in docs/spec/ or .build/DECISIONS.md, say so. -->

## How it was verified

<!-- The commands you ran and what they printed. "Tests pass" on its own is not evidence. -->

```
```

## Checklist

- [ ] `pnpm check` passes (lint, typecheck, build, test)
- [ ] Tested on Windows, or it does not touch anything platform-specific
- [ ] Any new reliance on Claude Code behaviour is recorded in `docs/research/claude-code-capabilities.md` with a source
- [ ] No default that bypasses permissions, no install script, no telemetry, no secrets in output
- [ ] A changeset is included if users would notice this (`pnpm changeset`)
