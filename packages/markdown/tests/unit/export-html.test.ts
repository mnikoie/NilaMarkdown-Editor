import { describe, it, expect } from "vitest";
import { parse } from "../../src/core/markdown/parse.js";
import { exportHtml } from "../../src/core/export-html.js";

/** فقط بدنه — بی `<head>` و CSS، تا assertion‌ها خوانا بمانند. */
const body = (md: string, options = {}) =>
  exportHtml(parse(md), { standalone: false, ...options });

describe("خروجیِ HTML — پایه", () => {
  it("پاراگراف", () => {
    expect(body("سلام دنیا\n")).toContain("<p>سلام دنیا</p>");
  });

  it("عنوان با سطحِ درست", () => {
    expect(body("## عنوان\n")).toContain("<h2");
    expect(body("###### شش\n")).toContain("<h6");
  });

  it("تأکید و کد", () => {
    const out = body("**پررنگ** و *کج* و `کد`\n");
    expect(out).toContain("<strong>پررنگ</strong>");
    expect(out).toContain("<em>کج</em>");
    expect(out).toContain("<code>کد</code>");
  });

  it("فهرست", () => {
    const out = body("- یک\n- دو\n");
    expect(out).toContain("<ul>");
    expect(out).toContain("<li>یک</li>");
  });

  it("چک‌لیست، چک‌باکسِ غیرفعال می‌گیرد", () => {
    const out = body("- [x] کرده\n- [ ] نکرده\n");
    expect(out).toContain('<input type="checkbox" disabled checked>');
    expect(out).toContain('<input type="checkbox" disabled>');
  });

  it("بلوکِ کد با کلاسِ زبان", () => {
    const out = body("```ts\nconst a = 1;\n```\n");
    expect(out).toContain('<code class="language-ts">');
    expect(out).toContain("const a = 1;");
  });

  it("جدول با تراز", () => {
    const out = body("| الف | ب |\n| :- | -: |\n| ۱ | ۲ |\n");
    expect(out).toContain("<table>");
    expect(out).toContain("<th style=\"text-align: left\">");
    expect(out).toContain("<th style=\"text-align: right\">");
  });

  it("نقلِ قول و جداکننده", () => {
    expect(body("> نقل\n")).toContain("<blockquote>");
    expect(body("---\n")).toContain("<hr>");
  });
});

describe("خروجیِ HTML — امنیت", () => {
  it("★ متن escape می‌شود", () => {
    const out = body("متنِ <script>alert(1)</script> عادی\n");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("★ لینکِ javascript: مسدود می‌شود", () => {
    const out = body("[کلیک](javascript:alert(1))\n");
    expect(out).not.toContain("javascript:");
    expect(out).toContain("#blocked");
  });

  it("★ تصویرِ ناامن رندر نمی‌شود", () => {
    const out = body("![الف](javascript:alert(1))\n");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("<img");
  });

  it("data:image مجاز است", () => {
    expect(body("![الف](data:image/png;base64,AAA)\n")).toContain("<img");
  });

  it("★ لینکِ خارجی rel امن می‌گیرد", () => {
    const out = body("[سایت](https://example.com)\n");
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("لینکِ داخلی rel نمی‌گیرد", () => {
    expect(body("[لنگر](#fasl-1)\n")).not.toContain("noopener");
  });

  it("★ HTMLِ خام پیش‌فرض escape می‌شود", () => {
    const out = body("<div onclick=\"alert(1)\">متن</div>\n");
    // خودِ رشتهٔ «onclick» می‌ماند — ولی به‌صورتِ **متن**، نه صفت.
    // شرطِ درست: هیچ تگِ زنده‌ای ساخته نشده باشد.
    expect(out).not.toContain('<div onclick');
    expect(out).toContain("&lt;div");
    expect(out).toContain("&quot;");
  });

  it("html=sanitize، تگِ مجاز را نگه می‌دارد", () => {
    const out = body("<p><strong>متن</strong></p>\n", { html: "sanitize" });
    expect(out).toContain("<strong>");
  });

  it("★ عنوانِ سند هم escape می‌شود", () => {
    const out = exportHtml(parse("متن\n"), { title: "<script>alert(1)</script>" });
    expect(out).not.toContain("<title><script>");
  });
});

describe("خروجیِ HTML — مارک‌ها و ساختار", () => {
  it("کارتِ مارک با برچسب و رنگ", () => {
    const out = body(":::نکته\nمحتوا\n:::\n");
    expect(out).toContain('data-mark="نکته"');
    expect(out).toContain("نکتهٔ نویسنده");
    expect(out).toContain("--tm-mark-base");
    expect(out).toContain("محتوا");
  });

  it("شماره و وضعیتِ ماده", () => {
    const out = body(":::ماده{شماره=۵۰ وضعیت=منسوخ}\nمتن\n:::\n");
    expect(out).toContain("ماده ۵۰");
    expect(out).toContain('data-status="منسوخ"');
  });

  it("★ مارکِ ناشناخته هم رندر می‌شود، حذف نمی‌شود", () => {
    const out = body(":::ناشناخته{الف=ب}\nمحتوای مهم\n:::\n");
    expect(out).toContain("محتوای مهم");
    expect(out).toContain('data-mark="ناشناخته"');
  });

  it("★ لنگرِ صریحِ سرفصل در خروجی می‌ماند", () => {
    // ارجاع‌های `#fasl-4` بینِ فایل‌های صادرشده باید کار کنند.
    expect(body("# فصل {#fasl-4}\n")).toContain('id="fasl-4"');
  });

  it("★ سرفصلِ بی‌لنگر، لنگرِ خودکار می‌گیرد", () => {
    const out = body("# فصل چهارم\n");
    expect(out).toMatch(/id="[^"]+"/);
  });

  it("فوت‌نوت با لینکِ رفت و برگشت", () => {
    const out = body("متن[^1]\n\n[^1]: توضیح\n");
    expect(out).toContain('id="fnref-1"');
    expect(out).toContain('href="#fn-1"');
    expect(out).toContain('id="fn-1"');
    expect(out).toContain('href="#fnref-1"');
  });

  it("فهرستِ مطالب ساخته می‌شود", () => {
    const out = body("# یک\n\n## دو\n", { toc: true });
    expect(out).toContain('class="tm-toc"');
    expect(out).toContain("فهرست");
  });

  it("بی toc، فهرست نمی‌آید", () => {
    expect(body("# یک\n")).not.toContain("tm-toc");
  });

  it("front matter در خروجی نمی‌آید", () => {
    const out = body("---\nشناسه: ۱۲۳\n---\n\nمتن\n");
    expect(out).not.toContain("شناسه");
    expect(out).toContain("متن");
  });
});

describe("خروجیِ HTML — سندِ کامل", () => {
  it("ساختارِ HTMLِ معتبر", () => {
    const out = exportHtml(parse("متن\n"), { title: "سند" });
    expect(out).toMatch(/^<!doctype html>/);
    expect(out).toContain('<html lang="fa" dir="rtl">');
    expect(out).toContain("<title>سند</title>");
    expect(out).toContain("</html>");
  });

  it("★ CSS درون‌خطی است — فایل مستقل کار می‌کند", () => {
    const out = exportHtml(parse("متن\n"));
    expect(out).toContain("<style>");
    expect(out).toContain("--tm-bg");
    expect(out).not.toContain("<link");
  });

  it("تمِ تاریک و چاپ در CSS هست", () => {
    const out = exportHtml(parse("متن\n"));
    expect(out).toContain("prefers-color-scheme: dark");
    expect(out).toContain("@media print");
  });

  it("جهت و زبان قابلِ تنظیم‌اند", () => {
    const out = exportHtml(parse("x\n"), { dir: "ltr", lang: "en" });
    expect(out).toContain('lang="en" dir="ltr"');
  });

  it("CSSِ دلخواه جایگزین می‌شود", () => {
    const out = exportHtml(parse("x\n"), { css: "body{color:red}" });
    expect(out).toContain("body{color:red}");
    expect(out).not.toContain("--tm-bg");
  });

  it("standalone=false فقط بدنه می‌دهد", () => {
    const out = exportHtml(parse("متن\n"), { standalone: false });
    expect(out).not.toContain("<!doctype");
    expect(out).toContain("<p>متن</p>");
  });

  it("سندِ خالی خطا نمی‌دهد", () => {
    expect(() => exportHtml(parse(""))).not.toThrow();
  });

  it("★ سندِ کاملِ حقوقی بی خطا صادر می‌شود", () => {
    const md =
      "# فصل اول {#f1}\n\n::::ماده{شماره=۵۰ وضعیت=معتبر}\nمتنِ **ماده**\n\n" +
      ":::تبصره{شماره=۱}\nمتنِ تبصره\n:::\n::::\n\n" +
      "| الف | ب |\n| - | - |\n| ۱ | ۲ |\n\nمتن[^1]\n\n[^1]: منبع\n";
    const out = exportHtml(parse(md), { toc: true, title: "بخشنامه" });
    expect(out).toContain("ماده ۵۰");
    expect(out).toContain("تبصره ۱");
    expect(out).toContain("<table>");
    expect(out).toContain("fn-1");
    expect(out).toContain("tm-toc");
  });
});
