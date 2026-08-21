import { describe, it, expect } from "vitest";
import { parse } from "../../src/core/markdown/parse.js";
import { buildPrintHtml, exportPdf } from "../../src/core/export-pdf.js";

/**
 * خروجیِ PDF.
 *
 * ★ خودِ چاپ در jsdom قابلِ تست نیست (`window.print` وجود ندارد و
 * `iframe.srcdoc` بار نمی‌شود). پس اینجا **HTMLِ آمادهٔ چاپ** تست
 * می‌شود — یعنی همان چیزی که موتورِ چاپ می‌خواند. رفتارِ خودِ پنجرهٔ
 * چاپ در e2e دیده می‌شود.
 */

const SANAD = `# فصل اول

متنِ ماده.

::::ماده{شماره=۳۸ وضعیت=معتبر}
کارفرما مکلف است.
::::

\`\`\`ts
const x = 1;
\`\`\`

| ماده | وضعیت |
| - | - |
| ۳۸ | معتبر |
`;

describe("خروجیِ PDF", () => {
  it("سندِ کامل می‌سازد، نه قطعه", () => {
    const html = buildPrintHtml(parse(SANAD));
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("</head>");
    expect(html).toContain("<h1");
  });

  it("★ همان محتوای خروجیِ HTML را دارد — یک منبعِ حقیقت", () => {
    const html = buildPrintHtml(parse(SANAD));
    expect(html).toContain("فصل اول");
    expect(html).toContain("کارفرما مکلف است");
    expect(html).toContain("<table>");
    expect(html).toContain("const x = 1;");
  });

  it("★ `@page` با اندازهٔ کاغذ — تنها جایی که کار می‌کند", () => {
    expect(buildPrintHtml(parse("x\n"))).toMatch(/@page\s*\{[^}]*size:\s*A4/);
    expect(buildPrintHtml(parse("x\n"), { pageSize: "Letter" })).toMatch(
      /@page\s*\{[^}]*size:\s*Letter/,
    );
  });

  it("حاشیهٔ دلخواه", () => {
    expect(buildPrintHtml(parse("x\n"), { margin: "3cm" })).toContain("margin: 3cm");
  });

  it("★ رنگِ پس‌زمینه در چاپ حفظ می‌شود", () => {
    // بی این، «ماده» و «تبصره» در کاغذ از هم قابلِ تشخیص نیستند.
    expect(buildPrintHtml(parse(SANAD))).toContain("print-color-adjust: exact");
  });

  it("★ سرفصل تهِ صفحه تنها نمی‌ماند", () => {
    const html = buildPrintHtml(parse(SANAD));
    expect(html).toMatch(/h1[^{]*\{[^}]*break-after:\s*avoid/);
  });

  it("★ کارت و جدول وسطشان صفحه عوض نمی‌شود", () => {
    const html = buildPrintHtml(parse(SANAD));
    expect(html).toMatch(/\.tm-mark[^{]*\{[^}]*break-inside:\s*avoid/);
  });

  it("شمارهٔ صفحه — روشن و خاموش", () => {
    expect(buildPrintHtml(parse("x\n"))).toContain("counter(page)");
    expect(buildPrintHtml(parse("x\n"), { pageNumbers: false })).not.toContain("counter(page)");
  });

  it("★ CSSِ چاپ **بعد از** CSSِ اصلی می‌آید تا بتواند رویش را بگیرد", () => {
    const html = buildPrintHtml(parse("x\n"));
    expect(html.indexOf("--tm-bg")).toBeLessThan(html.indexOf("@page"));
    // و هر دو داخلِ همان یک `<style>`اند.
    expect(html.indexOf("@page")).toBeLessThan(html.indexOf("</style>"));
  });

  it("★★ همان قواعدِ امنیت — اسکریپت در خروجیِ چاپ اجرا نمی‌شود", () => {
    const html = buildPrintHtml(parse("<script>alert(1)</script>\n"));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("★ لینکِ `javascript:` در چاپ هم مسدود است", () => {
    expect(buildPrintHtml(parse("[x](javascript:alert(1))\n"))).toContain("#blocked");
  });

  it("جهت و زبان قابلِ تنظیم‌اند", () => {
    expect(buildPrintHtml(parse("x\n"), { dir: "ltr" })).toContain("direction: ltr");
    expect(buildPrintHtml(parse("x\n"))).toContain("direction: rtl");
  });

  it("★ بیرونِ مرورگر خطا نمی‌دهد، فقط `ok: false`", async () => {
    // در jsdom `document` هست ولی `print` نیست — این تست حالتِ
    // «بی مرورگر» را می‌سنجد که در SSR پیش می‌آید.
    const doc = parse("x\n");
    const original = globalThis.document;
    // عمداً حذف می‌شود تا مسیرِ SSR تست شود.
    delete (globalThis as { document?: unknown }).document;
    try {
      await expect(exportPdf(doc)).resolves.toEqual({ ok: false, reason: "بیرونِ مرورگر" });
    } finally {
      globalThis.document = original;
    }
  });
});
