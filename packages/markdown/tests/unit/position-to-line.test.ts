import { describe, it, expect } from "vitest";
import { parse } from "../../src/core/markdown/parse.js";
import { positionToLine } from "../../src/core/markdown/serialize.js";
import { buildOutline, flattenOutline } from "../../src/core/outline/build.js";

/**
 * positionToLine: موقعیتِ ProseMirror → شمارهٔ خط در سورسِ سریالایزشده.
 *
 * ★ این تابع برای ناوبریِ پنل به حالتِ سورس ساخته شد — قبلاً آن مسیر
 * دنبالِ خطی می‌گشت که شاملِ عنوانِ نمایشیِ گره باشد؛ برای آیتم‌های
 * فهرست (که عنوانشان «۶. متنِ خلاصه…» است، نه متنِ خامِ مارک‌داون)
 * هیچ‌وقت پیدا نمی‌شد. اینجا مستقیماً با شمارهٔ خطِ واقعیِ سریالایزشده
 * مقایسه می‌شود، نه با جستجوی متنی.
 */
describe("positionToLine", () => {
  it("موقعیتِ سرفصلِ دوم، خطِ همان سرفصل را می‌دهد", () => {
    const md = "# یک\n\nمتنِ یک\n\n# دو\n\nمتنِ دو\n";
    const doc = parse(md);
    const tree = buildOutline(doc);
    const second = tree[1]!;
    const line = positionToLine(doc, second.from);
    const lines = md.split("\n");
    expect(lines[line]).toBe("# دو");
  });

  it("★★ روی سندِ چندلیستی، هر آیتمِ فهرست به خطِ واقعیِ خودش نگاشت می‌شود", () => {
    const md =
      "# فصل اول\n\n" +
      "1. بند یک\n2. بند دو\n3. بند سه\n4. بند چهار\n5. بند پنج\n" +
      "6. بند شش\n7. بند هفت\n8. بند هشت\n9. بند نه\n10. بند ده\n\n" +
      "# فصل دوم\n\nمتنِ فصلِ دوم\n";
    const doc = parse(md);
    const tree = buildOutline(doc);
    const chapterOne = tree[0]!;
    const lines = md.split("\n");

    for (const item of chapterOne.children) {
      const line = positionToLine(doc, item.from);
      // آن خط باید واقعاً همان بند باشد — این دقیقاً چیزی است که
      // جستجوی قبلیِ متنی برایش شکست می‌خورد.
      const ordinalDigits = item.title.match(/^([۰-۹]+)\./)?.[1];
      expect(ordinalDigits).toBeDefined();
      // شمارهٔ فارسی را به انگلیسی برگردان تا با سورس مقایسه شود.
      const enOrdinal = [...ordinalDigits!].map((d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).join("");
      expect(lines[line]).toContain(`${enOrdinal}. `);
    }
  });

  it("★★ سرفصلِ بعدِ فهرست هم درست است — مرزِ فهرست↔بلوکِ بعدی", () => {
    const md = "# فصل اول\n\n1. یک\n2. دو\n3. سه\n\n# فصل دوم\n\nمتن\n";
    const doc = parse(md);
    const tree = buildOutline(doc);
    const chapterTwo = tree[1]!;
    const line = positionToLine(doc, chapterTwo.from);
    expect(md.split("\n")[line]).toBe("# فصل دوم");
  });

  it("موقعیتِ ابتدای سند، خطِ صفر می‌دهد", () => {
    const md = "# یک\n";
    const doc = parse(md);
    expect(positionToLine(doc, 0)).toBe(0);
  });

  it("موقعیتِ داخلِ متنِ بلوکی (نه لبهٔ بلوک) هم قابلِ نگاشت است", () => {
    const md = "# فصل\n\nپاراگرافِ اول\n\n## زیرعنوان\n";
    const doc = parse(md);
    const tree = flattenOutline(buildOutline(doc));
    const sub = tree.find((n) => n.title === "زیرعنوان")!;
    const line = positionToLine(doc, sub.from);
    expect(md.split("\n")[line]).toBe("## زیرعنوان");
  });
});
