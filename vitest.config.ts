import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**'],
      // R: WORKFLOW section 6 requires >= 80% coverage on packages/core.
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
