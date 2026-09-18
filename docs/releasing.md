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

`Settings → Environments`. Create four, and give **each** one a required reviewer (you):

| Environment | Gates |
|---|---|
| `npm-next` | publishing to npm under the `next` tag |
| `testpypi` | publishing to TestPyPI |
| `pypi` | publishing to PyPI |
| `npm-latest` | moving npm's `latest` tag onto the new version |

Without the reviewers these environments are decoration and the pipeline publishes on its own.
**Adding the reviewer is the stop point.** Everything else here is plumbing.

### 2. npm — trusted publishing

Trusted publishing means no long-lived token in your repository. npm authenticates the workflow
itself through OIDC, and publishes provenance automatically.

On npmjs.com → the `delphi-team` package → **Settings → Trusted Publisher → GitHub Actions**:

| Field | Value |
|---|---|
| Organization or user | `thaildhe172591` |
| Repository | `delphi-team` |
| Workflow filename | `release.yml` |
| Environment | `npm-next` |

Every field is **case-sensitive and must match exactly**. The workflow filename in particular:
renaming `release.yml` breaks publishing until npmjs is updated to match, which is why there is a
note saying so at the top of that file.

> **The first publish is the awkward one.** Trusted publishing is configured on a package that
> exists, and yours does not yet. Either publish `0.1.0` once with a token — set `NPM_TOKEN` as a
> repository secret, and the workflow uses it automatically — or reserve the name manually, then
> configure trusted publishing and **delete the secret**. The workflow prints which path it took.

Requires npm 11.5.1 or later on Node 22.14 or later; `release.yml` pins the npm version rather than
trusting the runner's.

### 3. PyPI and TestPyPI — trusted publishing

Same idea, no token. On **both** pypi.org and test.pypi.org → *Your projects → Publishing → Add a
new publisher → GitHub*:

| Field | Value |
|---|---|
| Owner | `thaildhe172591` |
| Repository | `delphi-team` |
| Workflow | `release.yml` |
| Environment | `pypi` on PyPI, `testpypi` on TestPyPI |

For a project that does not exist yet, use **"pending publisher"** — PyPI supports configuring a
trusted publisher before the first upload, which npm does not.

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
| **npm @next** | on npm, installable only as `delphi-team@next` |
| **TestPyPI** | on TestPyPI, where a broken wheel can still be deleted |
| **PyPI** | on PyPI, permanently — a version number cannot be reused |
| **npm @latest** | what `npm install -g delphi-team` gives everyone |

Between the first gate and the last, install it yourself:

```bash
npm install -g delphi-team@next
delphi doctor
pipx install --index-url https://test.pypi.org/simple/ delphi-team
```

The GitHub release — binaries, checksums, SBOM, generated notes — is created after the last gate.

---

## If something goes wrong

**Before any approval:** do nothing. Nothing was published. Fix it, tag the next patch.

**After npm `@next`, before `@latest`:** nobody has it unless they asked for `@next` by name. Fix
forward with a new version. Do not unpublish; do not move `latest` onto it.

**After PyPI:** that version number is spent. PyPI does not allow re-uploading a version, even after
deleting it. Release a patch.

**After npm `@latest`:** move the tag back to the previous good version, then release a patch.

```bash
npm dist-tag add delphi-team@<previous> latest
```

`npm unpublish` is almost never the answer. It breaks every lockfile that already references the
version, and within 72 hours it also blocks reusing the number.
