import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'integration',
    include: ['src/**/*.int.test.ts'],
    environment: 'node',
    testTimeout: 60_000,  // Testcontainers startup
    hookTimeout: 120_000,
    // No mocks for owned infrastructure — real Postgres + Redis via Testcontainers (§12.3)
  },
});
