# Example departments

Three shapes of department that ship with delphi. Each one is a set of seats, the models they run on,
and what each seat owns.

| Pack | For | Seats |
|---|---|---|
| `solo-dev` | You are the whole team | dev-be, reviewer |
| `software-team` | A product with a roadmap and a schema that changes | ba, pm, techlead, dev-be, dev-fe, db-engineer, qa, tester, reviewer |
| `content-team` | Work whose output is prose | researcher, tech-writer, editor |

## Using one

```bash
delphi pack list                    # what there is
delphi pack show solo-dev           # what it is for, and what it would change here
delphi pack apply solo-dev          # the diff — nothing is written
delphi pack apply solo-dev --write  # do it
delphi role build --all             # build the seats it named
delphi doctor
```

`apply` prints a diff and stops, because it edits `.delphi/config.yaml` and that file is yours. The
merge keeps your comments and every setting the pack does not mention; applying the same pack twice
changes nothing the second time.

## Reading one instead

A pack is config and nothing else — there is no magic in it. The source is one YAML file each:

- [`packs/solo-dev/pack.yaml`](../packages/templates/files/packs/solo-dev/pack.yaml)
- [`packs/software-team/pack.yaml`](../packages/templates/files/packs/software-team/pack.yaml)
- [`packs/content-team/pack.yaml`](../packages/templates/files/packs/content-team/pack.yaml)

Everything under `config:` is merged into your `.delphi/config.yaml`. You can copy the parts you want
by hand and skip the command entirely.

## The part to edit after applying

**`owns`.** It is the list of globs each seat may touch, and it is what stops two seats being
dispatched onto one file. The packs guess at a layout — `src/api/**`, `src/web/**`, `db/**` — and a
guess about your repository is worth exactly what you paid for it.

Get this wrong and delphi will still refuse the collision it can see: two stories claiming one path
are blocked before either seat starts. Get it right and the refusals stop being necessary.
