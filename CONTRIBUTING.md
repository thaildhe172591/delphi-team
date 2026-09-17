# Contributing

Thanks for looking. delphi-team is pre-alpha and built phase by phase from the specification in
[`docs/spec/`](docs/spec/); `.build/STATE.md` says which phase is current and what is in flight.

## Getting set up

Requirements: Node >= 20, pnpm, git. For the binary and wheel work you also need
[bun](https://bun.sh) and [pipx](https://pipx.pypa.io).

```bash
pnpm install
pnpm check        # lint, typecheck, build, test — the same gate CI runs
```

Useful targets:

| Command | What it does |
|---|---|
| `pnpm build` | Build every package |
| `pnpm test` | Run the test suite |
| `pnpm coverage` | Run with coverage (`packages/core` must stay at or above 80%) |
| `pnpm lint:fix` | Format and autofix |
| `pnpm sync-version` | Propagate the CLI version to the Python distribution |
| `node scripts/build-binaries.mjs` | Compile a standalone binary for the host platform |

## delphi runs on itself

This repository is set up with delphi (`.delphi/` and `.claude/`), because a tool for
coordinating work should be used to coordinate its own. The committed `.claude/settings.json`
installs hooks that call `delphi hook ...`.

If you do not have delphi on your PATH those hooks fail, harmlessly: they are fail-open by
design, so Claude Code carries on and the error is logged to the gitignored `.delphi/logs/`.
To make them do something, build the CLI and put it on your PATH, or ignore them.

## Ground rules

**Windows first.** It is the primary target. Anything that assumes a POSIX shell, forward slashes, or a path
without spaces or non-ASCII characters is a bug. Prefer spawning processes without a shell.

**Do not invent Claude Code behaviour.** Before relying on a flag, setting, frontmatter field, hook event or
payload, verify it against the installed version and the official docs, and record it in
[`docs/research/claude-code-capabilities.md`](docs/research/claude-code-capabilities.md) with its source. If it
cannot be verified, say so and design a fallback.

**Safety is not negotiable.** No bypassing permission checks by default, no install scripts, no telemetry, no
overwriting a user's configuration without an explicit flag, a dry run and a diff. Hooks fail open. Database
capabilities are read-only by default. Never print secrets.

**One source of templates.** Everything `delphi init` writes comes from `packages/templates`, so the npm package,
the PyPI wheels and the generated plugin all produce identical files.

## Commits and changes

Conventional Commits. Keep each commit building and testing on its own. Add a changeset
(`pnpm changeset`) for anything users would notice.

## Reporting things

Bugs and ideas go to the issue tracker. Security problems go to [SECURITY.md](SECURITY.md) instead — please do not
open a public issue for those.
