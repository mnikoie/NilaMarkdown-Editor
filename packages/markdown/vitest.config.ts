import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    // بیشترِ تست‌ها بی DOM کار می‌کنند، ولی widgetهای پیش‌نمایشِ زنده
    // برای خوانده‌شدن به document نیاز دارند.
    environment: "jsdom",
  },
});
