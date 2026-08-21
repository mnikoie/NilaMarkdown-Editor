import { test, expect } from "@playwright/test";

/**
 * تایپوگرافیِ متنِ سند.
 *
 * ★ **چرا این فایل وجود دارد.** همهٔ باگ‌هایی که اینجا تست می‌شوند،
 * مدت‌ها در کد بودند و **هیچ‌کدام** هیچ تستی را قرمز نکردند: سرفصل با
 * پاراگراف هم‌اندازه بود، فهرست نه نقطه داشت نه شماره، نقلِ‌قول هیچ
 * نشانه‌ای نداشت، و هر فرمولِ ریاضی دوبار چاپ می‌شد.
 *
 * علتشان یکی بود: `preflight.css` عمداً حذف شده (تصمیمِ درستی است) ولی
 * جایش پر نشده بود. تستِ ساختاری این را نمی‌بیند چون گره‌ها **هستند** —
 * فقط بی‌استایل‌اند. پس اینجا **مقدارِ محاسبه‌شدهٔ CSS** سنجیده می‌شود،
 * نه وجودِ گره.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/markdown");
  await page.waitForSelector(".tm-editor", { timeout: 25000 });
});

test("★ سرفصل از پاراگراف بزرگ‌تر و پررنگ‌تر است", async ({ page }) => {
  const size = (s: string) =>
    page.locator(s).first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));

  // سندِ نمونه فقط `h1` و `h2` دارد؛ سطحِ سوم اینجا سنجیده نمی‌شود.
  const [h1, h2, p] = await Promise.all([
    size(".tm-editor h1"),
    size(".tm-editor h2"),
    size(".tm-editor p"),
  ]);

  // سلسله‌مراتب واقعی، نه فقط «متفاوت».
  expect(h1).toBeGreaterThan(h2);
  expect(h2).toBeGreaterThan(p);

  const weight = await page
    .locator(".tm-editor h1")
    .first()
    .evaluate((e) => getComputedStyle(e).fontWeight);
  expect(Number(weight)).toBeGreaterThanOrEqual(600);
});

test("★ فهرست نشانه و تورفتگی دارد", async ({ page }) => {
  const ul = page.locator(".tm-editor ul").first();
  await expect(ul).toHaveCSS("list-style-type", "disc");

  const pad = await ul.evaluate((e) =>
    parseFloat(getComputedStyle(e).paddingInlineStart),
  );
  expect(pad).toBeGreaterThan(8);
});

test("★ فهرستِ شماره‌دار در سندِ فارسی رقمِ فارسی می‌گیرد", async ({ page }) => {
  // «۱.» نه «1.» — سندِ فارسی با رقمِ لاتین شروع نمی‌شود.
  await expect(page.locator(".tm-editor ol").first()).toHaveCSS(
    "list-style-type",
    "persian",
  );
});

test("★ چک‌لیست مربع دارد، نه فقط متن", async ({ page }) => {
  const box = await page.locator('.tm-editor li[data-checked]').first().evaluate((e) => {
    const s = getComputedStyle(e, "::before");
    return { w: parseFloat(s.inlineSize || s.width), border: s.borderTopWidth };
  });
  expect(box.w).toBeGreaterThan(4);
  expect(parseFloat(box.border)).toBeGreaterThan(0);
});

test("★ نقلِ قول خطِ کناری دارد", async ({ page }) => {
  const w = await page
    .locator(".tm-editor blockquote")
    .first()
    .evaluate((e) => parseFloat(getComputedStyle(e).borderInlineStartWidth));
  expect(w).toBeGreaterThan(0);
});

test("★★ هر فرمول یک‌بار دیده می‌شود، نه دوبار", async ({ page }) => {
  // KaTeX دو خروجی می‌سازد: دیداری و MathMLِ صفحه‌خوان. اگر دومی مخفی
  // نشود، `E = mc² E = mc2` چاپ می‌شود.
  const mathml = page.locator(".tm-editor .katex-mathml").first();
  await expect(mathml).toBeAttached();
  await expect(mathml).toHaveCSS("position", "absolute");

  const h = await mathml.evaluate((e) => e.getBoundingClientRect().height);
  expect(h).toBeLessThan(4);

  // ★ ولی حذف نشده — صفحه‌خوان باید همچنان بخواندش.
  await expect(mathml).not.toHaveCSS("display", "none");
});

test("★ CSSِ KaTeX بار شده — وگرنه فرمول متنِ درهم است", async ({ page }) => {
  // بی `katex.min.css`، این عنصر `display: inline` می‌ماند و فرمول
  // به‌صورتِ «i=1∑n i = 2n(n + 1)» درمی‌آید.
  await expect(page.locator(".tm-math-block .katex-html").first()).toHaveCSS(
    "display",
    "block",
  );
});

test("★ نوارِ ابزار آیکونِ واقعی دارد، نه گلیفِ متنی", async ({ page }) => {
  const buttons = await page.locator(".tm-toolbar button").count();
  const svgs = await page.locator(".tm-toolbar button svg").count();
  // هر دکمه دقیقاً یک آیکون.
  expect(svgs).toBe(buttons);
});

test("★ فوت‌نوت از متنِ عادی جدا دیده می‌شود", async ({ page }) => {
  const def = page.locator(".tm-editor .tm-footnote-def").first();
  await expect(def).toHaveCSS("display", "flex");

  const w = await def.evaluate((e) =>
    parseFloat(getComputedStyle(e).borderInlineStartWidth),
  );
  expect(w).toBeGreaterThan(0);
});

test("★★ استایل‌ها از ویرایشگر بیرون نمی‌زنند", async ({ page }) => {
  // ★ کلِ دلیلِ حذفِ `preflight` همین بود. اگر روزی انتخابگری بی
  // `.tm-editor` نوشته شود، این تست می‌گیردش.
  const outside = await page.evaluate(() => {
    const h = document.createElement("h1");
    h.textContent = "بیرون";
    document.body.append(h);
    const size = getComputedStyle(h).fontSize;
    const weight = getComputedStyle(h).fontWeight;
    h.remove();
    return { size, weight };
  });

  const inside = await page
    .locator(".tm-editor h1")
    .first()
    .evaluate((e) => getComputedStyle(e).fontSize);

  // سرفصلِ بیرونی نباید اندازهٔ سرفصلِ داخلی را گرفته باشد.
  expect(outside.size).not.toBe(inside);
});
