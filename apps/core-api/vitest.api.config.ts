import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api',
    include: ['src/**/*.api.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    // Hits real running server + Testcontainers DB (§12.3a)
  },
});
