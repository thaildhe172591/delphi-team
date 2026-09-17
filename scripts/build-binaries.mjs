#!/usr/bin/env node
/**
 * Compile the CLI into standalone binaries with `bun build --compile` (ADR-0003).
 *
 * Bun cross-compiles every target from one host, which is why it was chosen over Node SEA
 * (no macOS x64, no musl) and over pkg (archived since January 2024). Expect 60-85 MB each.
 *
 * Usage: node scripts/build-binaries.mjs [target ...]   (default: the host target only)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'dist-binaries')

/** target -> the wheel platform tag it belongs in (docs/spec/PACKAGING_SPEC.md section 3). */
export const TARGETS = {
  'bun-windows-x64': 'py3-none-win_amd64',
  'bun-darwin-arm64': 'py3-none-macosx_11_0_arm64',
  'bun-darwin-x64': 'py3-none-macosx_10_12_x86_64',
  'bun-linux-x64': 'py3-none-manylinux_2_17_x86_64.manylinux2014_x86_64',
  'bun-linux-arm64': 'py3-none-manylinux_2_17_aarch64.manylinux2014_aarch64',
  'bun-linux-x64-musl': 'py3-none-musllinux_1_2_x86_64',
}

/**
 * Find a real bun executable.
 *
 * On Windows the `bun` on PATH is a shell script and `bun.cmd` is a batch shim; neither can
 * be started without a shell, and we do not want a shell — paths here may contain spaces or
 * non-ASCII characters (docs/spec/PACKAGING_SPEC.md section 4). So look for the actual
 * executable on PATH instead. `BUN` overrides it.
 */
function bunExecutable() {
  if (process.env.BUN) return process.env.BUN
  const names = process.platform === 'win32' ? ['bun.exe'] : ['bun']
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const name of names) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) return candidate
    }
  }
  // npm installs bun as a shim on PATH and hides the executable in the package.
  const nested = join(
    dirname(process.execPath),
    'node_modules',
    'bun',
    'bin',
    process.platform === 'win32' ? 'bun.exe' : 'bun',
  )
  if (existsSync(nested)) return nested
  throw new Error('bun not found. Install it (npm i -g bun) or set BUN to its path.')
}

function hostTarget() {
  const os = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform]
  const arch = { x64: 'x64', arm64: 'arm64' }[process.arch]
  if (!os || !arch) throw new Error(`unsupported host: ${process.platform}/${process.arch}`)
  return `bun-${os}-${arch}`
}

const requested = process.argv.slice(2)
const targets = requested.length ? requested : [hostTarget()]

const bun = bunExecutable()
const entry = join(root, 'packages/cli/dist/index.js')
if (!existsSync(entry)) throw new Error(`build the CLI first: ${entry} is missing`)

mkdirSync(outDir, { recursive: true })
for (const target of targets) {
  if (!(target in TARGETS)) throw new Error(`unknown target: ${target}`)
  const name = target.startsWith('bun-windows') ? 'delphi.exe' : 'delphi'
  const out = join(outDir, target, name)
  console.log(`building ${target} -> ${out}`)
  execFileSync(bun, ['build', entry, '--compile', `--target=${target}`, '--outfile', out], {
    stdio: 'inherit',
    cwd: root,
  })
}
