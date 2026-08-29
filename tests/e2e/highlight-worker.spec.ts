import { test, expect } from "@playwright/test";

/**
 * رنگ‌آمیزیِ کد در Web Worker.
 *
 * ★ چیزی که اینجا واقعاً ثابت می‌شود و در jsdom نمی‌شود: صفحه در حینِ
 * بارگذاریِ Shiki **پاسخ‌گو می‌ماند**. تا قبل از worker، همین تست
 * timeout می‌خورد چون `page.evaluate` هم اجرا نمی‌شد.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/markdown?fixture=demo");
  await page.waitForSelector(".tm-editor", { timeout: 25000 });
});

test("★ رشتهٔ اصلی در حینِ رنگ‌آمیزی قفل نمی‌شود", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // بلوکِ کد بلافاصله دیده می‌شود — منتظرِ Shiki نمی‌ماند.
  const block = page.locator('.tm-code[data-language="ts"]').first();
  await expect(block).toBeVisible();
  await expect(block.locator("> pre > code")).toContainText("const x");

  // ★ سنجهٔ اصلی: رشتهٔ اصلی آزاد است. اگر Shiki در همین رشته بار
  // می‌شد، این حلقه چند ثانیه معطل می‌ماند.
  const blocked = await page.evaluate(async () => {
    const start = performance.now();
    let worst = 0;
    for (let i = 0; i < 60; i++) {
      const t = performance.now();
      await new Promise((r) => requestAnimationFrame(r));
      worst = Math.max(worst, performance.now() - t);
    }
    return { worst, total: performance.now() - start };
  });

  // ۲۵۰ میلی‌ثانیه سخاوتمندانه است؛ حالتِ قبلی چند **ثانیه** بود.
  expect(blocked.worst).toBeLessThan(250);
  expect(errors).toEqual([]);
});

test("★ کد واقعاً رنگ می‌گیرد", async ({ page }) => {
  const block = page.locator('.tm-code[data-language="ts"]').first();

  // worker باید بالا بیاید، shiki را بیاورد، گرامرِ ts را بگیرد، و
  // پاسخ بدهد. اولین بار کند است — سقفِ سخاوتمندانه.
  await expect(block).toHaveAttribute("data-highlighted", "true", { timeout: 30000 });

  // ★ لایهٔ رنگ محتوا دارد و از `contentDOM` جداست — متنِ قابلِ ویرایش
  // دست‌نخورده مانده.
  const layer = block.locator(".tm-code-highlight");
  await expect(layer.locator("span").first()).toBeAttached();

  // ★ متنِ سند دو برابر نشده: `serialize` نباید HTMLِ رنگی را ببیند.
  //
  // ★ انتخابگر عمداً `>` دارد: HTMLِ Shiki خودش هم `<pre><code>` است و
  // بی این، انتخابگر به دو عنصر می‌خورد. همین دوگانگی نشان می‌دهد که
  // لایهٔ رنگ و لایهٔ ویرایش **واقعاً از هم جدا** مانده‌اند.
  const codeText = await block.locator("> pre > code").innerText();
  expect(codeText).toContain("const x: number = 1;");
  expect(codeText).not.toContain("<span");
});

test("★ زبانِ ناشناخته سند را نمی‌شکند", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // ★ بلوکِ آماده در سندِ نمونه، نه تایپ با کیبورد.
  //
  // ناوبری با کلید در این سند غیرقابلِ اتکاست (فرانت‌متر و بلوکِ کد
  // مکان‌نما را جای غیرمنتظره می‌برند) — همان تله‌ای که در بقیهٔ
  // فایل‌های e2e هم با `placeCursorInParagraph` دور زده شده.
  const block = page.locator('.tm-code[data-language="brainfuck"]');
  await expect(block).toBeVisible();

  // زبان در فهرستِ `langs.ts` نیست → خام می‌ماند. **این خطا نیست.**
  await expect(block).toHaveAttribute("data-highlighted", "false", { timeout: 30000 });

  // ولی متن هنوز کامل و خوانا است — همان قولِ «نبودِ رنگ‌آمیزی سند را
  // نمی‌شکند».
  await expect(block.locator("> pre > code")).toContainText("++++++++[");
  expect(errors).toEqual([]);
});
