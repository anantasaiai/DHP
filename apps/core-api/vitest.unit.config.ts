import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'unit',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.unit.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/*/domain/**'],
      thresholds: {
        branches: 100, // domain layer must be ~100% branch-tested (§12.2)
        functions: 90,
        lines: 90,
      },
    },
  },
});
