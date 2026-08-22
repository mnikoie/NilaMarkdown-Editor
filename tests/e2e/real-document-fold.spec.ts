import { existsSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

const REAL_DOCUMENT_CANDIDATES = [
  "D:\\- AIProject\\01- Bakhshnameh\\- خلاصه سازی دستورالعمل\\- Kholase\\- Files\\- MD01\\BakhshnamehTalkhis - 62285360.md",
  "D:\\- AIProject\\01- Bakhshnameh\\- خلاصه سازی دستورالعمل\\- Kholase\\- Files\\- MD01\\BakhshnamehTalkhis - 62285360 (اصلاح‌شده).md",
  "D:\\- AIProject\\01- Bakhshnameh\\- خلاصه سازی دستورالعمل\\- Kholase\\- Files\\- MD01\\BakhshnamehTalkhis - 62285360_.md",
] as const;
const REAL_DOCUMENT = REAL_DOCUMENT_CANDIDATES.find(existsSync);

test.describe("فایل واقعیِ بخشنامهٔ ۶۲۲۸۵۳۶۰", () => {
  test.skip(!REAL_DOCUMENT, `هیچ نسخه‌ای از فایل واقعیِ ۶۲۲۸۵۳۶۰ پیدا نشد`);
  // WebKit/Firefox و Chrome واقعی در اجرای هم‌زمانِ ماتریس روی همین فایلِ
  // بزرگ کندترند؛ سقفِ بیشتر برای کارِ واقعی است، نه retry پنهان.
  test.setTimeout(360_000);

  async function loadRealDocument(page: Page) {
    await page.goto("/markdown");
    await page.waitForSelector(".tm-editor", { timeout: 25_000 });
    await page.locator('input[type="file"][accept*="text/markdown"]').setInputFiles(REAL_DOCUMENT!);
    await expect(page.locator(".tm-editor h1").first()).toContainText("بخشنامه تنقیح و تلخیص اجرائیات");
  }

  async function openEverythingWithoutAccordion(page: Page) {
    await page.getByRole("button", { name: "نمایش", exact: true }).click();
    await page.getByRole("menuitem", { name: "بازکردن همهٔ بخش‌ها" }).click();
    await page.getByRole("button", { name: "نمایش", exact: true }).click();
    const accordion = page.getByRole("menuitemcheckbox", { name: "در هر سطح فقط یک بخش باز باشد" });
    if ((await accordion.getAttribute("aria-checked")) === "true") await accordion.click();
    else await page.keyboard.press("Escape");
  }

  test("★★ عنوانِ اصلی والدِ همهٔ فصل‌هاست و همهٔ سند را می‌بندد", async ({ page }) => {
    await loadRealDocument(page);
    await openEverythingWithoutAccordion(page);

    const [h1Size, h2Size] = await Promise.all([
      page.locator(".tm-editor h1").first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
      page.locator(".tm-editor h2").first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    ]);
    expect(h2Size).toBeLessThan(h1Size);

    const rootItem = page.locator(".tm-outline-item").filter({ hasText: "بخشنامه تنقیح و تلخیص اجرائیات" }).first();
    await expect(rootItem).toHaveAttribute("aria-level", "1");
    await expect(page.locator('.tm-outline-item[aria-level="2"]').first()).toBeAttached();

    const title = page.locator(".tm-editor h1").first();
    await title.locator(".tm-inline-fold").dispatchEvent("mousedown");
    await expect(title).toHaveAttribute("data-folded", "true");
    await expect.poll(async () =>
      page.locator(".tm-editor :is(h1,h2,h3,h4,h5,h6):visible").count(),
    ).toBe(1);

    await title.locator(".tm-inline-fold").dispatchEvent("mousedown");
    await expect(title).toHaveAttribute("data-folded", "false");
    expect(await page.locator(".tm-editor :is(h1,h2,h3,h4,h5,h6):visible").count()).toBeGreaterThan(100);
  });

  test("★★ همهٔ عنوان‌های فایل واقعی یکی‌یکی بسته و دوباره باز می‌شوند", async ({ page }) => {
    await loadRealDocument(page);
    await openEverythingWithoutAccordion(page);

    const toggles = page.locator(".tm-editor .tm-inline-fold");
    const count = await toggles.count();
    expect(count).toBeGreaterThan(100);
    const markdownBeforeFolding = await page.getByTestId("markdown-output").textContent();

    for (let index = 0; index < count; index++) {
      const toggle = toggles.nth(index);
      const heading = toggle.locator("xpath=..");

      await toggle.dispatchEvent("mousedown");
      await expect(heading, `عنوان شمارهٔ ${index + 1} بسته نشد`).toHaveAttribute("data-folded", "true");
      await toggle.dispatchEvent("mousedown");
      await expect(heading, `عنوان شمارهٔ ${index + 1} دوباره باز نشد`).toHaveAttribute("data-folded", "false");
    }

    expect(await page.getByTestId("markdown-output").textContent()).toBe(markdownBeforeFolding);
  });

});
