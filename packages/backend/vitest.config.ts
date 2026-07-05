import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "../../src": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    // Integration tests share a single database — run files sequentially to
    // avoid parallel cleanup/setup races between suites.
    fileParallelism: false,
  },
});
