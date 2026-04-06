import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // No root-level setupFiles: each project defines its own to prevent the
    // unit-test ioredis mock from bleeding into integration tests.
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: {
        lines: 60,
        functions: 55,
        branches: 35,
        statements: 60,
      },
    },
    projects: [
      {
        test: {
          name: "unit",
          include: [
            "tests/api/**/*.test.ts",
            "tests/services/**/*.test.ts",
            "tests/workers/**/*.test.ts",
            "tests/jobs/**/*.test.ts",
          ],
          setupFiles: ["./tests/setup.ts"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["./tests/integration/setup.ts"],
          pool: "forks",
          poolOptions: {
            forks: { singleFork: true },
          },
          testTimeout: 30000,
        },
      },
    ],
  },
});
