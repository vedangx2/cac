import { defineConfig } from 'vitest/config';

// Vitest only runs our own unit tests — the engine and the small helpers it depends on.
// Those are plain TypeScript functions with no React and no browser APIs, which is exactly
// why the engine was written as pure functions in lib/ instead of inside a component: it can
// be tested directly, with no rendering and no fake DOM.
export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
});
