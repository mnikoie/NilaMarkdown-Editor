import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * لایه‌بندی باید با تست اجبار شود، نه با نیتِ خوب.
 *
 * `core/` بی React است تا منطق بی مرورگر تست شود و اگر روزی پوستهٔ دیگری
 * خواستیم، فقط `react/` دوباره نوشته شود.
 */

/** توضیحاتِ بلوکی و خطی را حذف می‌کند تا مثال‌های داخلشان تست را نشکنند. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** فقط خطوطی که واقعاً import یا export-from هستند. */
function importLines(text: string): string[] {
  return stripComments(text)
    .split("\n")
    .filter((l) => /^\s*(import|export)\b.*\bfrom\b/.test(l));
}

function filesIn(dir: string, ext = ".ts"): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesIn(full, ext));
    else if (entry.endsWith(ext) || entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("معماری", () => {
  it("core به React وابسته نیست", () => {
    for (const file of filesIn("src/core")) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/from ["']react/);
    }
  });

  it("core به prosemirror-view وابسته نیست، جز پلاگین‌ها", () => {
    // فقط پلاگین‌ها به Decoration نیاز دارند؛ schema و markdown و outline
    // باید بی DOM قابلِ استفاده باشند تا در Node و در viewer کار کنند.
    for (const file of filesIn("src/core")) {
      if (file.includes("plugins")) continue;
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/from ["']prosemirror-view/);
    }
  });

  it("ورودیِ viewer به ProseMirror وابسته نیست", () => {
    // بودجهٔ ۴۰ کیلوبایت فقط با این شرط ممکن است. فقط خطوطِ import
    // بررسی می‌شوند — نامِ یک ماژول داخلِ توضیح، وابستگی نیست.
    const imports = importLines(readFileSync("src/viewer.ts", "utf8"));
    for (const line of imports) {
      expect(line).not.toMatch(/prosemirror/);
      expect(line).not.toMatch(/core\/schema/);
      expect(line).not.toMatch(/core\/plugins/);
    }
  });

  it("هیچ رنگی در TS هارد-کد نشده", () => {
    // بندِ ۹: همهٔ رنگ‌ها از متغیرِ CSS. استثنا: builtin.ts که رنگِ پایهٔ
    // مارک‌های پیش‌فرض را تعریف می‌کند — همان‌ها هم به CSS variable می‌روند.
    for (const file of filesIn("src")) {
      if (file.includes("builtin.ts")) continue;
      // توضیحات مستثنا هستند: مثالِ رنگ در JSDoc، رنگِ هارد-کد نیست.
      const hex = stripComments(readFileSync(file, "utf8")).match(/#[0-9a-fA-F]{6}\b/g) ?? [];
      expect(hex, file).toEqual([]);
    }
  });
});
