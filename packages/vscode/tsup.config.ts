import { defineConfig } from 'tsup'

/**
 * A VS Code extension is loaded by the extension host as CommonJS, and `vscode` itself is
 * provided by the host rather than installed. Everything else is bundled, so the packaged
 * extension is one file with no `node_modules` to ship.
 */
export default defineConfig({
  entry: ['src/extension.ts'],
  format: ['cjs'],
  clean: true,
  target: 'node20',
  // `dependencies` is empty on purpose: tsup externalises what is declared there, and this
  // package must ship as a single file.
  external: ['vscode'],
})
