import { test, expect } from "@playwright/test";

/**
 * تستِ سرتاسری — رفتارِ واقعی در Chromium.
 *
 * چیزهایی که فقط اینجا دیده می‌شوند: KaTeX (در jsdom بار نمی‌شود)،
 * چیدمانِ RTL، و اینکه صفحه واقعاً پاسخ‌گو می‌ماند.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/markdown");
  await page.waitForSelector(".tm-editor", { timeout: 25000 });
});

test("صفحه بی خطا بار می‌شود و ساختار درست است", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await expect(page.locator(".tm-mark")).toHaveCount(7);
  await expect(page.locator('[data-status="منسوخ"]')).toHaveCount(1);
  await expect(page.locator('[data-unknown="true"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("★ پیش‌نمایشِ زنده — نشانه فقط در بلوکِ مکان‌نما", async ({ page }) => {
  // بیرونِ ادیتور: هیچ نشانه‌ای
  await expect(page.locator(".tm-marker")).toHaveCount(0);

  // کلیک داخلِ پاراگرافی که **پررنگ** دارد
  await page.locator(".tm-editor p", { hasText: "پررنگ" }).first().click();

  // نشانه‌ها با تراکنشِ بعدیِ ProseMirror ساخته می‌شوند، نه هم‌زمان با
  // کلیک. بی این انتظار، تست گاهی سبز و گاهی قرمز می‌شود.
  await expect(page.locator(".tm-marker").first()).toBeAttached({ timeout: 5000 });

  const markers = await page.locator(".tm-marker").allTextContents();
  expect(markers).toContain("**");

  // متنِ سند نباید نشانه داشته باشد
  const text = await page.locator(".tm-editor").innerText();
  expect(text).not.toContain("**پررنگ**");
});

test("★ KaTeX در مرورگرِ واقعی رندر می‌شود", async ({ page }) => {
  await expect(page.locator(".tm-math-block")).toHaveAttribute("data-rendered", "true");
  await expect(page.locator(".katex").first()).toBeVisible();
});

test("★ بی Shiki هم کد خوانا و قابلِ کپی است", async ({ page }) => {
  const code = page.locator(".tm-code").first();
  await expect(code).toHaveAttribute("data-highlighted", "false");
  await expect(code.locator("code")).toContainText("const x");
  await expect(code.locator(".tm-code-copy")).toHaveText("کپی");
});

test("★ Mermaid خاموش → کد دیده می‌شود، محتوا گم نمی‌شود", async ({ page }) => {
  const d = page.locator(".tm-mermaid");
  await expect(d).toHaveAttribute("data-rendered", "off");
  await expect(d.locator("code")).toContainText("graph TD");
});

test("★ تاشدن از پنلِ ساختار", async ({ page }) => {
  await expect(page.locator(".tm-folded-hidden")).toHaveCount(0);
  await page.locator(".tm-outline .tm-fold-toggle").first().click();
  expect(await page.locator(".tm-folded-hidden").count()).toBeGreaterThan(0);
  await expect(page.locator(".tm-fold-summary")).toContainText("پنهان");
});

test("★ تایپ کار می‌کند و خروجی به‌روز می‌شود", async ({ page }) => {
  await page.getByRole("button", { name: /خروجی/ }).click();
  const p = page.locator(".tm-editor p", { hasText: "جریمه" }).first();
  await p.click();
  await page.keyboard.type("آزمایش");
  await page.waitForTimeout(600); // debounce ۳۰۰ms
  await expect(page.locator("pre").last()).toContainText("آزمایش");
});

test("★ جدول رندر و ویرایش می‌شود", async ({ page }) => {
  const table = page.locator(".tm-editor table");
  await expect(table).toHaveCount(1);
  await expect(table.locator("th")).toHaveCount(3);
  await expect(table.locator("td")).toHaveCount(6);

  // تراز از مارک‌داون خوانده شده
  await expect(table.locator("th").nth(1)).toHaveCSS("text-align", "center");
  await expect(table.locator("th").nth(2)).toHaveCSS("text-align", "right");

  // تایپ داخلِ سلول
  const cell = table.locator("td").first();
  await cell.click();
  await page.keyboard.type("X");
  await expect(cell).toContainText("X");

  // Tab به سلولِ بعدی می‌رود
  await page.keyboard.press("Tab");
  await page.keyboard.type("Y");
  await expect(table.locator("td").nth(1)).toContainText("Y");
});
