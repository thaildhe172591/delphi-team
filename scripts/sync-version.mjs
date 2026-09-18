#!/usr/bin/env node
/**
 * One version across npm, PyPI, the plugin and the GitHub release
 * (docs/spec/PACKAGING_SPEC.md section 1, "version lockstep").
 *
 * packages/cli/package.json is the source of truth, because changesets versions it.
 * Run with --check to verify without writing; CI uses that to fail a drifting release.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')

const version = JSON.parse(readFileSync(join(root, 'packages/cli/package.json'), 'utf8')).version

/** Replace the first `key = "x.y.z"` style assignment, leaving everything else byte-identical. */
const targets = [
  { file: 'python/pyproject.toml', pattern: /^version = ".*"$/m, replacement: `version = "${version}"` },
  {
    file: 'python/src/delphi_team/__init__.py',
    pattern: /^__version__ = ".*"$/m,
    replacement: `__version__ = "${version}"`,
  },
  // The three generated manifests that carry a version. `build-plugin.mjs` writes them from
  // this same number, so leaving them behind fails `build-plugin --check` -- which is what a
  // version pull request did, because this script only claimed to cover the plugin (C-025).
  // Patching the line is enough, and it means bumping a version needs no build.
  {
    file: 'plugin/.claude-plugin/plugin.json',
    pattern: /"version": ".*"/,
    replacement: `"version": "${version}"`,
  },
  { file: 'plugin/plugin.json', pattern: /"version": ".*"/, replacement: `"version": "${version}"` },
  {
    file: '.claude-plugin/marketplace.json',
    pattern: /"version": ".*"/,
    replacement: `"version": "${version}"`,
  },
]

let drifted = 0
for (const { file, pattern, replacement } of targets) {
  const path = join(root, file)
  const before = readFileSync(path, 'utf8')
  if (!pattern.test(before)) {
    console.error(`sync-version: no version line found in ${file}`)
    process.exit(2)
  }
  const after = before.replace(pattern, replacement)
  if (after === before) continue
  drifted++
  if (check) console.error(`sync-version: ${file} is out of sync (expected ${version})`)
  else {
    writeFileSync(path, after)
    console.log(`sync-version: ${file} -> ${version}`)
  }
}

if (check && drifted) process.exit(1)
if (!drifted) console.log(`sync-version: everything already at ${version}`)
