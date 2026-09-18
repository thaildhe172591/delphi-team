# Releasing

How a version of delphi reaches npm and PyPI, and the one-time setup that has to exist first.

**Publishing is a stop point.** No job in `release.yml` reaches a registry without a person
pressing approve — each one names a GitHub environment, and those environments carry required
reviewers. A tag starts the pipeline; it does not finish it.

---

## One-time setup

These are the parts nobody can do for you: they need accounts you own. Do them once, in this
order, before the first release.

### 1. GitHub environments — the approval gates

`Settings → Environments`. Create two, and give **each** one a required reviewer (you):

| Environment | Gates |
|---|---|
| `npm-stage` | publishing to npm |
| `pypi` | publishing to PyPI |

> Earlier drafts also had `npm-next`, `npm-latest` and `testpypi`. All three are gone: npm is
> promoted on npmjs rather than by a job, and there is no TestPyPI stage.

Without the reviewers these environments are decoration and the pipeline publishes on its own.
**Adding the reviewer is the stop point.** Everything else here is plumbing.

**Leave "Prevent self-review" off.** GitHub's own description of it is "require a different
approver than the user who triggered the workflow run" — and on a one-person repository you are
both. Turn it on and you push the tag, then cannot approve your own run: the deployment waits
forever with nobody able to release it.

"Allow administrators to bypass configured protection rules" pulls the other way: you are an
administrator, so it makes the gate a reminder rather than a barrier. That is a reasonable escape
hatch for a solo maintainer and a hole in a team. Decide which you are.

### 2. npm — trusted publishing

Trusted publishing means no long-lived token in your repository. npm authenticates the workflow
itself through OIDC, and publishes provenance automatically.

On npmjs.com → the `delphi-team` package → **Settings → Trusted Publisher → GitHub Actions**:

| Field | Value |
|---|---|
| Organization or user | `thaildhe172591` |
| Repository | `delphi-team` |
| Workflow filename | `release.yml` |
| Environment | `npm-stage` |

Leave **"can also publish directly with `npm publish`" off**. `npm stage publish` is always
allowed, and a publisher that cannot publish directly is one that cannot put anything in front of
a user without you approving it — even if the workflow is compromised.

Every field is **case-sensitive and must match exactly**. The workflow filename in particular:
renaming `release.yml` breaks publishing until npmjs is updated to match, which is why there is a
note saying so at the top of that file.

> **The first publish is the awkward one, and npm is the awkward half.** Two npm features both
> refuse to work on a package that does not exist yet, and yours does not:
>
> - trusted publishing is configured on an existing package, so the first release needs a token
> - **staging cannot create a package either** — npm's own words are that you cannot stage a
>   brand-new package — so the first release publishes *directly*
>
> Both exceptions end at the same moment, which is why `release.yml` keys them off one condition:
> if `NPM_TOKEN` is set it runs `npm publish`, and if it is not it runs `npm stage publish`.
>
> PyPI has no such problem — see below — so this applies to npm alone.
>
> Two ways through it:
>
> 1. **A token, once.** Create a *granular* access token with read-and-write, a short expiry, and
>    **Bypass 2FA enabled**. Two of those need explaining:
>
>    - It has to cover **all packages**, because you cannot scope a token to a package that does
>      not exist — which is the other reason the expiry matters.
>    - **Bypass 2FA is not optional here.** Your account needs 2FA on, because approving a staged
>      release later is a 2FA challenge. But with 2FA on and this capability off, npm answers a
>      token publish with `EOTP` — it wants a one-time password, and CI has no one to ask. The
>      capability takes precedence over the account setting for publishing, which is exactly the
>      hole it exists to fill.
>
>    Put it in the repository as the `NPM_TOKEN` secret. Publish, configure trusted publishing,
>    then **delete the secret**. Prefer this: the first release goes through the whole pipeline,
>    so you find out whether the pipeline works while the stakes are a pre-alpha.
>
>    npm is retiring bypass-2FA tokens for direct publishing in January 2027. That is fine for a
>    token that exists for one release and is deleted; it is not a thing to keep.
> 2. **Publish by hand, once**, from your own npm login, then configure trusted publishing. No
>    token ever exists — but the first version skips every gate, and you learn nothing about the
>    pipeline until the second release.

Requires npm 11.15.0 or later for `npm stage publish` (trusted publishing itself needs 11.5.1 on
Node 22.14). `release.yml` pins the version rather than trusting the runner's.

### 3. PyPI — trusted publishing

Same idea, no token. On pypi.org → *Your projects → Publishing → Add a new publisher → GitHub*:

| Field | Value |
|---|---|
| Owner | `thaildhe172591` |
| Repository | `delphi-team` |
| Workflow | `release.yml` |
| Environment | `pypi` |

For a project that does not exist yet, use **"pending publisher"**. PyPI supports configuring a
trusted publisher *before* the first upload, which npm does not — so PyPI needs no token at any
point, not even for the first release.

Having published something else to PyPI before does not help here: trusted publishing is
configured per project, not per account.

---

## Cutting a release

### 1. Describe the change

Every change that a user would notice needs a changeset:

```bash
pnpm changeset
```

It asks which bump and for a line of prose. That line becomes the CHANGELOG entry and the release
notes, so write it for someone deciding whether to upgrade — not for someone reading the diff.

Commit the file it creates along with your work.

### 2. Let the version PR be opened

Merging to `main` makes `version.yml` open a **"chore: version packages"** pull request: the bump,
the CHANGELOG, and `pnpm sync-version` so `python/pyproject.toml` and the plugin manifest agree with
npm.

Read it. The version in that PR is the version the world gets.

### 3. Merge and tag

```bash
git checkout main && git pull
git tag "v$(node -p "require('./packages/cli/package.json').version")"
git push --tags
```

The tag must match `packages/cli/package.json` exactly. `release.yml` refuses otherwise, before
building anything.

### 4. Approve, in order

The pipeline runs and then waits at each gate. What runs before anything is published:

- `pnpm check` on the tag — lint, build, typecheck, every test
- `scripts/loop-lab.mjs` — the automation loop still stops when it should
- the tag, `package.json` and `pyproject.toml` all say the same version
- the npm tarball is self-contained and carries both READMEs
- six standalone binaries, their SHA-256 checksums, and a CycloneDX SBOM
- six platform wheels and an sdist

Then, in order, each waiting for you:

| | What approving means |
|---|---|
| **npm** | first release: published and installable. After that: staged, and **nobody can install it** until step 5 |
| **PyPI** | on PyPI, permanently — a version number cannot be reused |

There is no TestPyPI rehearsal, so the PyPI gate is the point of no return. What stands in for it
runs before you are asked: `twine check` on every distribution, and the wheels job installs the
wheel it just built and runs `delphi --version`. That covers metadata and whether the thing runs —
it does not cover whether it does the right thing, so read what you are approving.

### 5. Release the npm package yourself

**From the second release on.** The first one is already live — see the note under npm setup.

A staged version is not on npm until you say so, and that step is deliberately not automated:
it needs a human with a 2FA challenge.

```bash
npm stage list delphi-team      # what is waiting
npm stage view delphi-team      # what is in it
npm stage approve delphi-team   # release it
```

Or approve it on npmjs.com. Either way you are challenged for 2FA — an OIDC token cannot do this
and neither can an access token, which is the point.

Before approving, try it — the staged tarball is downloadable even though nobody can install it:

```bash
npm stage download delphi-team
```

`npm stage reject` throws the staged version away if it is wrong. Nothing was ever installable,
so there is nothing to retract and no version number is spent.

The GitHub release — binaries, checksums, SBOM, generated notes — is created after the gates.

---

## If something goes wrong

**Before any approval:** do nothing. Nothing was published. Fix it, tag the next patch.

**Staged but not approved:** nobody can install it at all. `npm stage reject delphi-team`, fix, and
tag again — the version number is not spent, because it never reached the registry.

**After PyPI:** that version number is spent. PyPI does not allow re-uploading a version, even after
deleting it. Release a patch. With no TestPyPI stage there is no rehearsal for this one — the gate
is the only thing between a tag and a permanent version.

**After you approve the staged npm version:** it is on the registry and people can install it. Move
`latest` back to the previous good version, then release a patch.

```bash
npm dist-tag add delphi-team@<previous> latest
```

That is one of the few things an OIDC token cannot do, so it needs `npm login` from your own
machine. `npm unpublish` is almost never the answer: it breaks every lockfile that already
references the version, and within 72 hours it also blocks reusing the number.
