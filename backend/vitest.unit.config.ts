import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      bullmq: path.resolve(__dirname, "../node_modules/bullmq/dist/cjs/index.js"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/api/**/*.test.ts",
      "tests/services/**/*.test.ts",
      "tests/workers/**/*.test.ts",
      "tests/jobs/**/*.test.ts",
      "tests/testing/**/*.test.ts",
      "tests/contracts/**/*.test.ts",
    ],
    fileParallelism: false,
  },
});
