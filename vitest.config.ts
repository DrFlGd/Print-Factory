import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/tests/**/*.test.ts', 'engines/*/tests/**/*.test.ts', 'modules/*/tests/**/*.test.ts', 'tools/tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
