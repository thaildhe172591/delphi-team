# @delphi-team/templates

The one source of every file `delphi init` writes into a user's project: role definitions, capability packs,
team templates, skills, hooks, ledger templates, `PROTOCOL.md` and the sample config.

Nothing here is published on its own — it is bundled into the `delphi-team` package, into the PyPI wheels and into
the generated Claude Code plugin, so all three distributions write byte-identical files.

Phase 2 fills this directory. It is present now so the workspace layout in `docs/spec/PACKAGING_SPEC.md` §2 is
real from the start rather than appearing later.
