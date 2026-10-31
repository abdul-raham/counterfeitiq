import { defineConfig } from 'vitest/config';

// Contacts the real Greenbook, so it is kept apart from the default test run.
export default defineConfig({
  test: { include: ['src/**/*.smoke.ts'], testTimeout: 15_000 },
});
