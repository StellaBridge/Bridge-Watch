import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/integration/setup.ts"],
    include: ["tests/integration/**/*.test.ts"],
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 30000,
  },
});
