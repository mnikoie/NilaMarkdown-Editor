import { defineConfig } from "vitest/config";

/** بنچمارک جدا از تست‌های واحد اجرا می‌شود — کند است و در CI هر بار لازم نیست. */
export default defineConfig({
  test: {
    include: ["tests/perf/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
  },
  optimizeDeps: { exclude: ["shiki", "mermaid", "katex"] },
});
