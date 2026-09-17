# Pythia — facts gathered from the local install (2026-09-17)

Source: the machine this repo is built on. Gathered with `pythia --help` and `pythia guide`.
Nothing here is guessed; BUILD_PROMPT rule 5 forbids inventing Pythia details.

| Fact | Value |
|---|---|
| Distribution | PyPI package `pythia-plsql`, version **0.14.2** (latest; released 2026-09-14) |
| Shape | a **CLI**, not an MCP server for Claude Code (`pythia mcp` exists but is documented as Codex-only) |
| Executable | `pythia` on PATH |
| Skills present | `using-pythia` (router) + `pythia-spec`, `-explore`, `-impact`, `-conventions`, `-write`, `-apply`, `-review`, `-setup`, `-skill-author` |

## Commands
`check ls src args ddl cols grep sql invalid errors deps impact similar plscope policy journal apply approve connections guide conventions agent-user history unistr mcp install`

Read side (free): `check ls src args ddl cols grep sql invalid errors deps impact similar plscope history similar`.
`sql` accepts SELECT/WITH only — there is no `--write` flag anywhere.

## Connection resolution (in order)
1. `--conn NAME`
2. `PYTHIA_CONNECTION` (names an entry in connections.json)
3. `PYTHIA_USER` / `PYTHIA_PASSWORD` / `PYTHIA_DSN` (+ optional `PYTHIA_SCHEMA`)
4. `.pythia/connections.json`, searched upward from cwd (`PYTHIA_CONFIG` overrides the path)

**`connections.json` holds passwords — an agent must never open it.** `pythia connections` lists names,
users and targets, and is the answer to "what can I reach".

## Write path (the only one)
`snapshot -> impact -> preview -> token -> approve -> apply -> verify -> report`, via `pythia apply <file.sql>`
then `pythia apply <file.sql> --confirm <token>`. The token is minted **only** by the developer
(`pythia approve <token>` at their terminal, or answering Approve to a question whose text is
`approve --card <token>` verbatim). An agent never mints it. Headless `--yes` is refused.
Policy lives in `.pythia/policy.json`; `pythia policy` prints the rules and a refusal is relayed, never routed around.
**Exit code 3 = written but broken** — must be reported as such, with the rollback line; `journal show/diff` is the evidence.
`journal restore <id>` undoes through the same gate. `unistr` produces exact non-ASCII literals.

## How this maps onto the `pythia-oracle` capability (CUSTOMIZATION_SPEC 2.2)
- `requires.commands: [pythia]` — it is a CLI, so `requires.mcp_servers` stays empty.
- `requires.skills: [using-pythia]` — the router pulls in the rest.
- `risk: high`, `safety.db_default: read-only` in config already matches Pythia's own default.
- The capability's "safety rails" section can point at Pythia's own gate rather than inventing one:
  the approval token IS the human gate that ROLES_SPEC 2.7 and R23 ask for.
