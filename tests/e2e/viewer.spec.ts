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
  await expect.poll(() => targetHeading.evaluate((element) => element.getBoundingClientRect().top))
    .toBeGreaterThanOrEqual(55);
  const headingTop = await targetHeading.evaluate((element) => element.getBoundingClientRect().top);
  expect(headingTop).toBeGreaterThanOrEqual(55);
  expect(headingTop).toBeLessThan(150);
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
