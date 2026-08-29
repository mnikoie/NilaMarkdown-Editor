import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/viewer?fixture=demo");
  await page.waitForSelector(".tm-viewer", { timeout: 25000 });
});

test("Viewer فقط‌خواندنی است و ابزارهای محدود خودش را دارد", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "راهنمای NilaMarkdown Viewer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "بازکردن فایل" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ساختار سند" })).toBeVisible();
  await expect(page.locator("[contenteditable='true']")).toHaveCount(0);
  await expect(page.getByRole("toolbar")).toHaveCount(0);
});

test("ساختار سند به عنوان انتخاب‌شده هدایت می‌کند", async ({ page }) => {
  const documentScroll = page.getByRole("region", { name: "متن سند" });
  await documentScroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });

  await page.getByRole("complementary", { name: "ساختار سند" })
    .getByRole("button", { name: "امکانات اصلی" })
    .click();

  const targetHeading = page.getByRole("heading", { name: "امکانات اصلی" });
  await expect.poll(async () => {
    const top = await targetHeading.evaluate((element) => element.getBoundingClientRect().top);
    return top >= 55 && top <= 110;
  }).toBe(true);
  const headingTop = await targetHeading.evaluate((element) => element.getBoundingClientRect().top);
  expect(headingTop).toBeGreaterThanOrEqual(55);
  expect(headingTop).toBeLessThanOrEqual(110);
});

test("تم و پنل ساختار مستقل از Editor کنترل می‌شوند", async ({ page }) => {
  const workspace = page.locator(".viewer-workspace");
  await expect(workspace).toHaveAttribute("data-theme", "dark");
  await expect(workspace).toHaveCSS("background-color", "rgb(0, 0, 0)");

  await page.getByRole("button", { name: "حالت روشن" }).click();
  await expect(workspace).toHaveAttribute("data-theme", "light");
  await expect(workspace).toHaveCSS("background-color", "rgb(247, 247, 247)");

  await page.getByRole("button", { name: "ساختار سند" }).click();
  await expect(page.getByRole("complementary", { name: "ساختار سند" })).toHaveCount(0);
});

test("چیدمان Viewer داخل viewport می‌ماند", async ({ page }) => {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerHeight,
    page: document.documentElement.scrollHeight,
    workspace: document.querySelector(".viewer-workspace")?.getBoundingClientRect().height ?? 0,
  }));
  expect(dimensions.page).toBe(dimensions.viewport);
  expect(dimensions.workspace).toBe(dimensions.viewport);
  await expect(page.locator(".tm-viewer")).toHaveCSS("display", "block");
  expect(await page.locator(".tm-viewer > p").first().evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(400);
});

test("Viewer روی موبایل اسکرول افقی ایجاد نمی‌کند", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForSelector(".tm-viewer");

  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    page: document.documentElement.scrollWidth,
    outline: document.querySelector(".viewer-outline")?.getBoundingClientRect().width ?? 0,
  }));
  expect(dimensions.page).toBe(dimensions.viewport);
  expect(dimensions.outline).toBeLessThan(dimensions.viewport);
});

test("جست‌وجوی Viewer فارسی/عربی و ارقام را یکسان می‌بیند و میان نتایج حرکت می‌کند", async ({ page }) => {
  await page.getByRole("button", { name: "جست‌وجو در سند" }).click();
  const input = page.getByRole("searchbox", { name: "عبارت جست‌وجو" });
  const resultCount = page.locator(".viewer-searchbar output");
  await input.fill("نمایش");
  await expect(resultCount).toContainText("از");
  await page.getByRole("button", { name: "نتیجه بعدی" }).click();
  await expect(resultCount).toContainText("۲ از");

  // کاف عربی، حرکت و رقم فارسی در سند باید با صورتِ فارسی/لاتین پیدا شوند.
  await input.fill("کتاب شماره 50");
  await expect(resultCount).toHaveText("۱ از ۱");

  // عبارت می‌تواند از مرزِ یک عنصر Markdown (strong) عبور کند.
  await input.fill("فایل‌های Markdown ساخته");
  await expect(resultCount).toHaveText("۱ از ۱");
});

test("جست‌وجو در مرورگرِ بدون CSS Highlight هم نتیجه را واضح می‌کند", async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(CSS, "highlights", { value: undefined, configurable: true });
    Object.defineProperty(window, "Highlight", { value: undefined, configurable: true });
  });
  await page.getByRole("button", { name: "جست‌وجو در سند" }).click();
  await page.getByRole("searchbox", { name: "عبارت جست‌وجو" }).fill("کتاب شماره 50");
  await expect(page.locator(".viewer-searchbar output")).toHaveText("۱ از ۱");
  await expect(page.locator('.viewer-search-fallback > span[data-active="true"]').first()).toBeVisible();
});

test("KaTeX، Shiki و Mermaid در Viewer واقعی رندر می‌شوند", async ({ page }) => {
  await expect(page.locator(".tm-viewer-math-inline .katex")).toBeVisible();
  await expect(page.locator(".tm-viewer-code[data-highlighted='true']")).toBeVisible({ timeout: 35_000 });
  await expect(page.locator(".tm-viewer-mermaid[data-rendered='true'] svg")).toBeVisible({ timeout: 35_000 });
});

test("حالت سورس Editor از فونت Vazirmatn استفاده می‌کند", async ({ page }) => {
  await page.goto("/markdown?fixture=demo");
  await page.waitForSelector(".tm-editor");
  await page.getByRole("button", { name: "حالتِ سورس (Ctrl+/)" }).click();
  await expect(page.locator(".tm-source")).toHaveCSS("font-family", /Vazirmatn/i);
});
