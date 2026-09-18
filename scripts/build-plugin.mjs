#!/usr/bin/env node
/**
 * Generate the committed plugin, and the marketplace manifest that points at it.
 *
 * `/plugin marketplace add thaildhe172591/delphi-team` reads `.claude-plugin/marketplace.json`
 * from the repository root, and each entry's `source` is a path *inside* the same repository.
 * So the plugin has to be committed, not built on demand — which makes it a generated
 * directory like `packages/core/src/templates/files.generated.ts`, with the same guarantee:
 * `--check` fails CI when it is stale, so a role edited without regenerating cannot ship an
 * old copy through the plugin while the CLI ships the new one.
 *
 * It is written wholesale rather than merged. A renamed skill has to disappear from here,
 * and today's `resume` -> `delphi-resume` is exactly the rename that would otherwise have
 * left a stale copy behind shadowing Claude Code's own command.
 *
 * Usage: node scripts/build-plugin.mjs [--check]
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPlugin } from '../packages/core/dist/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'plugin')
const check = process.argv.includes('--check')

const version = JSON.parse(readFileSync(join(root, 'packages/cli/package.json'), 'utf8')).version

/** The plugin itself: agents, skills, the protocol, and its own plugin.json. */
const plugin = buildPlugin({ version })

/**
 * The marketplace manifest.
 *
 * Kept here rather than inside `buildPlugin`, because it describes *this repository* — who
 * owns it and where the plugin sits in it — while `buildPlugin` describes the plugin, which
 * a user can also export into a repository of their own.
 */
const marketplace = {
  name: 'delphi-team',
  owner: {
    name: 'thaildhe172591',
    url: 'https://github.com/thaildhe172591',
  },
  description:
    'Run Claude Code as a department: an orchestrator and specialist seats, each with its own role, memory and file scope.',
  plugins: [
    {
      name: 'delphi-team',
      source: './plugin',
      description:
        'The seats and the skills that drive them. The ledger and every delphi command come from the CLI: `npm install -g delphi-team`.',
      version,
      author: { name: 'thaildhe172591', url: 'https://github.com/thaildhe172591' },
      homepage: 'https://github.com/thaildhe172591/delphi-team',
      repository: 'https://github.com/thaildhe172591/delphi-team',
      license: 'MIT',
      keywords: ['claude-code', 'agents', 'orchestration', 'roles'],
      category: 'workflow',
    },
  ],
}

const files = new Map()
for (const file of plugin.files) {
  files.set(join(out, file.path), file.content)
}
files.set(join(root, '.claude-plugin/marketplace.json'), `${JSON.stringify(marketplace, null, 2)}\n`)

/** Every file under `dir`, so a leftover from a rename is noticed rather than ignored. */
function walk(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...walk(full))
    else found.push(full)
  }
  return found.sort()
}

const normalise = (text) => text.replace(/\r\n/g, '\n')

if (check) {
  let present = []
  try {
    present = walk(out)
  } catch {
    console.error('build-plugin: plugin/ is missing. Run: pnpm build:plugin')
    process.exit(1)
  }

  const expected = new Set([...files.keys()].filter((path) => path.startsWith(out)))
  for (const path of present) {
    if (!expected.has(path)) {
      console.error(`build-plugin: ${relative(root, path)} is left over. Run: pnpm build:plugin`)
      process.exit(1)
    }
  }

  for (const [path, content] of files) {
    let current
    try {
      current = normalise(readFileSync(path, 'utf8'))
    } catch {
      console.error(`build-plugin: ${relative(root, path)} is missing. Run: pnpm build:plugin`)
      process.exit(1)
    }
    if (current !== normalise(content)) {
      console.error(`build-plugin: ${relative(root, path)} is stale. Run: pnpm build:plugin`)
      process.exit(1)
    }
  }

  console.log(`build-plugin: up to date (${files.size} files)`)
} else {
  rmSync(out, { recursive: true, force: true })
  for (const [path, content] of files) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  const inPlugin = [...files.keys()].filter((path) => path.startsWith(out)).length
  console.log(`build-plugin: wrote ${inPlugin} files to plugin/ and the marketplace manifest`)
}
