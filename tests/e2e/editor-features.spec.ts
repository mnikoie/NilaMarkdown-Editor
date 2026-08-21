import { test, expect } from "@playwright/test";

/**
 * تمام‌صفحه، خروجیِ PDF، و خمیرکردنِ تصویر — در مرورگرِ واقعی.
 *
 * ★ هر سه چیزهایی‌اند که jsdom نمی‌تواند ثابتشان کند: Fullscreen API،
 * موتورِ چاپ، و `DataTransfer`ِ واقعی.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/markdown");
  await page.waitForSelector(".tm-editor", { timeout: 25000 });
});

test("★ تمام‌صفحه با دکمهٔ نوارِ ابزار", async ({ page }) => {
  const root = page.locator(".tm-root");
  await expect(root).not.toHaveAttribute("data-fullscreen", /.+/);

  const button = page.getByRole("button", { name: /تمام‌صفحه/ });
  await button.click();

  // ★ در Chromium واقعی، Fullscreen API هست — پس حالتِ `real`.
  await expect(root).toHaveAttribute("data-fullscreen", "real");

  // ★ برچسبِ دکمه عوض شده — کاربر می‌داند دوباره زدن چه می‌کند.
  await expect(page.getByRole("button", { name: /خروج از تمام‌صفحه/ })).toBeVisible();
});

test("★ خروجِ مرورگر از تمام‌صفحه، حالتِ React را هم‌گام می‌کند", async ({ page }) => {
  const root = page.locator(".tm-root");
  await page.getByRole("button", { name: /تمام‌صفحه/ }).click();
  await expect(root).toHaveAttribute("data-fullscreen", "real");

  // ★ مرورگر می‌تواند **خودش** بیرون بیاید — با `Escape`، تعویضِ تب، یا
  // سیاستِ خودش. اینجا از مسیرِ برنامه‌ای شبیه‌سازی می‌شود چون
  // `Escape` در Chromiumِ headless اصلاً از تمام‌صفحه بیرون نمی‌آورد
  // (محدودیتِ headless، نه رفتارِ ما).
  //
  // چیزی که تست می‌شود همان چیزی است که مالِ ماست: شنیدنِ
  // `fullscreenchange`. بی آن، دکمه می‌گفت «خروج» ولی صفحه عادی بود.
  await page.evaluate(() => document.exitFullscreen());

  await expect(root).not.toHaveAttribute("data-fullscreen", /.+/);
  await expect(page.getByRole("button", { name: "تمام‌صفحه (F11)" })).toBeVisible();
});

test("★ در تمام‌صفحه، متن هنوز قابلِ ویرایش است", async ({ page }) => {
  await page.getByRole("button", { name: /تمام‌صفحه/ }).click();
  await expect(page.locator(".tm-root")).toHaveAttribute("data-fullscreen", "real");

  await page.locator(".tm-editor p", { hasText: "پررنگ" }).first().click();
  await page.keyboard.type("ﺁزمایش");
  await expect(page.locator(".tm-editor")).toContainText("ﺁزمایش");
});

test("★ خروجیِ PDF — پنجرهٔ چاپ باز می‌شود و صفحه نمی‌شکند", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // ★ `window.print` را می‌گیریم: در حالتِ headless پنجرهٔ واقعی باز
  // نمی‌شود، ولی چیزی که می‌خواهیم ثابت کنیم این است که **صدا زده
  // می‌شود** و روی سندِ درست.
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__printed = [];
  });
  await page.reload();
  await page.waitForSelector(".tm-editor", { timeout: 25000 });

  await page.evaluate(() => {
    const orig = HTMLIFrameElement.prototype;
    const log = (window as unknown as Record<string, unknown>).__printed as string[];
    // چاپ داخلِ iframe اتفاق می‌افتد؛ روی همان نمونه تله می‌گذاریم.
    const observer = new MutationObserver(() => {
      for (const f of document.querySelectorAll("iframe")) {
        const w = (f as HTMLIFrameElement).contentWindow;
        if (w && !(w as unknown as Record<string, unknown>).__trapped) {
          (w as unknown as Record<string, unknown>).__trapped = true;
          w.print = () => log.push(w.document.documentElement.outerHTML);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    void orig;
  });

  await page.getByRole("button", { name: /خروجیِ PDF/ }).click();

  // ★ محتوای واقعیِ صفحهٔ چاپ بررسی می‌شود، نه فقط «صدا زده شد».
  await expect
    .poll(async () => (await page.evaluate(() => (window as never as Record<string, string[]>).__printed)).length, {
      timeout: 15000,
    })
    .toBeGreaterThan(0);

  const printed = await page.evaluate(
    () => (window as never as Record<string, string[]>).__printed[0],
  );
  expect(printed).toContain("فصل اول");
  expect(printed).toContain("@page");
  expect(printed).toContain("print-color-adjust");
  // ★ و همان قواعدِ امنیت: اسکریپتِ داخلِ سند در صفحهٔ چاپ اجرا نمی‌شود.
  expect(printed).not.toContain("<script>window.__XSS__");
  expect(errors).toEqual([]);
});

test("★ خمیرکردنِ تصویر — گرهٔ تصویر ساخته می‌شود", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.locator(".tm-editor p", { hasText: "پررنگ" }).first().click();
  await page.keyboard.press("End");

  // ★ `DataTransfer`ِ واقعیِ مرورگر با یک PNGِ واقعی — دقیقاً همان
  // چیزی که کلیپ‌بورد می‌دهد.
  await page.evaluate(async () => {
    const b64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const file = new File([bytes], "چسبانده.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    const editor = document.querySelector(".tm-editor") as HTMLElement;
    editor.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  });

  const img = page.locator(".tm-editor img").first();
  await expect(img).toBeVisible({ timeout: 10000 });
  await expect(img).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(img).toHaveAttribute("alt", "چسبانده");
  expect(errors).toEqual([]);
});

test("★ فایلِ غیرتصویری، تصویر نمی‌سازد", async ({ page }) => {
  await page.locator(".tm-editor p", { hasText: "پررنگ" }).first().click();

  await page.evaluate(() => {
    const file = new File(["سلام"], "a.txt", { type: "text/plain" });
    const dt = new DataTransfer();
    dt.items.add(file);
    document
      .querySelector(".tm-editor")!
      .dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
      );
  });

  await page.waitForTimeout(1000);
  await expect(page.locator(".tm-editor img")).toHaveCount(0);
});
