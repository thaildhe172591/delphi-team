import { createRequire } from 'node:module'
import { defineConfig } from 'tsup'

const pkg = createRequire(import.meta.url)('./package.json') as { version: string }

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  target: 'node20',
  // The version is inlined at build time: a bun-compiled binary (ADR-0003) has no
  // package.json to read at runtime, and npm and PyPI must print the same string.
  define: { __DELPHI_VERSION__: JSON.stringify(pkg.version) },
  banner: { js: '#!/usr/bin/env node' },
  noExternal: ['@delphi-team/core'],
})
