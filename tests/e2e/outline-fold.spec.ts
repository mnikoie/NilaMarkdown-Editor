import { test, expect } from "@playwright/test";

/**
 * درختِ ساختار و تاشدنِ فصل.
 *
 * ★ هر دو باگی که اینجا تست می‌شوند، **دیداری** بودند و از دیدِ
 * تست‌های ساختاری نامرئی: درخت از اول درست ساخته می‌شد
 * (`aria-level` هر دو فصل ۱ بود) ولی چون فصلِ بی‌فرزند جای مثلث را
 * خالی می‌گذاشت، عنوانش ۱۶ پیکسل جابه‌جا می‌افتاد و **مثلِ زیرمجموعه
 * دیده می‌شد**.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/markdown");
  await page.waitForSelector(".tm-editor", { timeout: 25000 });
});

test("★★ فصل‌های هم‌سطح واقعاً هم‌تراز دیده می‌شوند", async ({ page }) => {
  const item = (id: string) => page.locator(`[data-outline-id="${id}"]`);

  // اول ساختار: هر دو در سطحِ یک‌اند.
  await expect(item("fasl-1")).toHaveAttribute("aria-level", "1");
  await expect(item("fasl-2")).toHaveAttribute("aria-level", "1");

  // ★ و بعد **آنچه چشم می‌بیند** — همان چیزی که قبلاً غلط بود.
  const right = (id: string) =>
    item(id)
      .locator(".tm-outline-title")
      .evaluate((e) => Math.round(e.getBoundingClientRect().right));

  const [a, b] = await Promise.all([right("fasl-1"), right("fasl-2")]);
  // «فصل اول» فرزند ندارد و «فصل دوم» دارد؛ با این حال باید هم‌تراز باشند.
  expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
});

test("★ جای‌گیر هم‌عرضِ دکمهٔ تاشدن است", async ({ page }) => {
  const w = (s: string) =>
    page.locator(s).first().evaluate((e) => Math.round(e.getBoundingClientRect().width));

  const [spacer, toggle] = await Promise.all([
    w(".tm-outline .tm-fold-spacer"),
    w(".tm-outline .tm-fold-toggle"),
  ]);
  expect(spacer).toBe(toggle);
  expect(spacer).toBeGreaterThan(0);
});

test("★ سرفصل در خودِ متن مثلثِ تاشدن دارد", async ({ page }) => {
  const h1 = page.locator(".tm-editor h1").first();
  const handle = h1.locator(".tm-inline-fold");
  await expect(handle).toBeAttached();

  // نودِ والد بدون نیاز به hover هم باید قابلِ تشخیص باشد.
  await expect(handle).toHaveCSS("opacity", "0.55");

  // با hover دیده می‌شود.
  await h1.hover();
  await expect(handle).toHaveCSS("opacity", "1");
});

test("★★ کلیک روی مثلثِ متن، فصل را می‌بندد و باز می‌کند", async ({ page }) => {
  const h1 = page.locator(".tm-editor h1").first();
  const handle = h1.locator(".tm-inline-fold");

  // ★ حالت روی **خودِ سرفصل** است نه روی دکمه — دلیلش در `fold.ts`
  // کنارِ `foldState` نوشته شده.
  await expect(h1).toHaveAttribute("data-folded", "false");

  await h1.hover();
  await handle.click();

  await expect(h1).toHaveAttribute("data-folded", "true");
  await expect(h1).toHaveAttribute("aria-expanded", "false");
  expect(await page.locator(".tm-folded-hidden").count()).toBeGreaterThan(0);
  await expect(page.locator(".tm-fold-summary").first()).toBeVisible();

  await h1.hover();
  await handle.click();

  await expect(h1).toHaveAttribute("data-folded", "false");
  await expect(page.locator(".tm-folded-hidden")).toHaveCount(0);
});

test("★ باز و بسته‌شدن پشتِ‌هم پایدار است", async ({ page }) => {
  // ★ این تست از یک باگِ واقعی آمده: نسخهٔ اول فقط **یک‌بار** بسته
  // می‌شد و دیگر باز نمی‌شد، چون `Decoration.node` بینِ `mousedown` و
  // `mouseup` دکمه را جایگزین می‌کرد و `click` هرگز کامل نمی‌شد.
  const h1 = page.locator(".tm-editor h1").first();
  const handle = h1.locator(".tm-inline-fold");

  for (const expected of ["true", "false", "true", "false"]) {
    await h1.hover();
    await handle.click();
    await expect(h1).toHaveAttribute("data-folded", expected);
  }
});

test("★ بستنِ فصل، سرفصلش را پنهان نمی‌کند", async ({ page }) => {
  const h1 = page.locator(".tm-editor h1").first();
  const text = (await h1.innerText()).trim();

  await h1.hover();
  await h1.locator(".tm-inline-fold").click();
  await expect(h1).toHaveAttribute("data-folded", "true");

  // وگرنه کاربر چیزی برای کلیک‌کردن و بازکردن ندارد.
  await expect(h1).toContainText(text.replace(/^⌄\s*/, ""));
});

test("★ خلاصه هم فصل را باز می‌کند", async ({ page }) => {
  const h1 = page.locator(".tm-editor h1").first();
  await h1.hover();
  await h1.locator(".tm-inline-fold").click();
  await expect(h1).toHaveAttribute("data-folded", "true");

  await page.locator(".tm-fold-summary").first().click();
  await expect(page.locator(".tm-folded-hidden")).toHaveCount(0);
});

test("★★ تاشدن وارد مارک‌داون نمی‌شود", async ({ page }) => {
  const output = page.getByTestId("markdown-output");
  const before = await output.textContent();

  const h1 = page.locator(".tm-editor h1").first();
  await h1.hover();
  await h1.locator(".tm-inline-fold").click();
  await expect(h1).toHaveAttribute("data-folded", "true");
  await page.waitForTimeout(600);

  // ★ حالتِ نمایش هرگز نباید در سند بنشیند — وگرنه رفت‌وبرگشت می‌شکند.
  expect(await output.textContent()).toBe(before);
});

test("★★ همهٔ کارت‌های دارای زیرمجموعه نودِ بازوبسته‌شونده‌اند", async ({ page }) => {
  const cards = page.locator(".tm-mark");
  const toggles = cards.locator(":scope > .tm-mark-header > .tm-fold-toggle");
  await expect(toggles).toHaveCount(await cards.count());

  // «هشدار» قبلاً collapsible نبود؛ اکنون مثل هر والدِ دیگر تا می‌شود.
  const warning = page.locator('.tm-mark[data-mark="هشدار"]');
  const toggle = warning.locator(":scope > .tm-mark-header > .tm-fold-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(warning).toHaveAttribute("data-folded", "true");
  await expect(warning.locator(":scope > .tm-mark-body")).toBeHidden();
  await toggle.click();
  await expect(warning.locator(":scope > .tm-mark-body")).toBeVisible();
});

test("★ چیدمانِ صفحه مثل Typora تمام‌قد و پنلِ ساختار در چپ است", async ({ page }) => {
  await expect(page.locator(".markdown-workspace")).toBeVisible();
  await expect(page.getByRole("heading", { name: "@tamin/markdown" })).toHaveCount(0);

  const [workspace, sidebar, editor] = await Promise.all([
    page.locator(".markdown-workspace").boundingBox(),
    page.locator(".tm-sidebar").boundingBox(),
    page.locator(".tm-main").boundingBox(),
  ]);
  expect(workspace?.height).toBeGreaterThanOrEqual(700);
  expect(sidebar!.x).toBeLessThan(editor!.x);
  expect(Math.abs(sidebar!.height - workspace!.height)).toBeLessThanOrEqual(1);
});
