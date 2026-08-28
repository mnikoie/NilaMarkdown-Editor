import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    // NodeViewها و widgetهای پیش‌نمایشِ زنده به document نیاز دارند.
    environment: "jsdom",
  },
  // ★ این سه در تست هرگز بار نمی‌شوند (`isRealBrowser()` جلویشان را
  // می‌گیرد)، ولی Vite با اسکنِ ایستا `import()`شان را می‌بیند و از پیش
  // باندل می‌کند. اندازه‌گیری شد: تستِ ۱ ثانیه‌ای را به ۹۰ ثانیه می‌برد و
  // گاهی worker را می‌کُشد. اینجا از آن اسکن کنار گذاشته می‌شوند.
  optimizeDeps: { exclude: ["shiki", "mermaid", "katex"] },
  ssr: { external: ["shiki", "mermaid", "katex"] },
});
