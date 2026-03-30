import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/api/**/*.test.ts",
      "tests/services/**/*.test.ts",
      "tests/workers/**/*.test.ts",
      "tests/jobs/**/*.test.ts",
    ],
  },
});
