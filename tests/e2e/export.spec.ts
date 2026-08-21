import { test, expect } from "@playwright/test";

/**
 * خروجیِ HTML — تستِ فایلِ واقعی در مرورگر.
 *
 * فایلِ صادرشده باید **مستقل** باشد: بی سرور، بی CSSِ بیرونی، و امن.
 */
test("★ فایلِ صادرشده درست و امن رندر می‌شود", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/export-sample.html");

  // ★ هیچ اسکریپتی اجرا نشده
  const xss = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__EXPORT_XSS__ ?? null,
  );
  expect(xss).toBeNull();
  expect(errors).toEqual([]);

  // ساختار
  await expect(page.locator("h1")).toContainText("فصل اول");
  await expect(page.locator(".tm-toc")).toBeVisible();
  await expect(page.locator(".tm-mark")).toHaveCount(4);
  await expect(page.locator("table")).toBeVisible();

  // ★ CSS واقعاً اعمال شده — فایل بی هیچ وابستگی خودکفاست
  await expect(page.locator("body")).toHaveCSS("direction", "rtl");
  const cardBg = await page.locator(".tm-mark").first().evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  expect(cardBg).not.toBe("rgba(0, 0, 0, 0)");

  // وضعیتِ منسوخ دیده می‌شود
  await expect(page.locator('[data-status="منسوخ"]').first()).toBeAttached();

  // ★ لینکِ فوت‌نوت کار می‌کند
  await page.locator(".tm-fn-ref a").first().click();
  await expect(page).toHaveURL(/#fn-/);

  // لینکِ خارجی امن است
  await expect(page.locator('a[href^="https"]').first()).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
});
