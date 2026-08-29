import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

/**
 * تمام‌صفحه، خروجیِ PDF، و خمیرکردنِ تصویر — در مرورگرِ واقعی.
 *
 * ★ هر سه چیزهایی‌اند که jsdom نمی‌تواند ثابتشان کند: Fullscreen API،
 * موتورِ چاپ، و `DataTransfer`ِ واقعی.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/markdown?fixture=demo");
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

test("★ Ctrl+K ویرایشگرِ لینک را باز می‌کند و لینک می‌سازد", async ({ page }) => {
  await page.evaluate(() => {
    const p = [...document.querySelectorAll(".tm-editor p")].find((node) =>
      node.textContent?.includes("پررنگ"),
    );
    const text = [...(p?.childNodes ?? [])].find((node) => node.textContent?.includes("اینجاست"));
    if (!text) throw new Error("متنِ هدف پیدا نشد");
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    (document.querySelector(".tm-editor") as HTMLElement).focus();
  });

  await page.keyboard.press("Control+k");
  const form = page.getByRole("form", { name: "ویرایشِ لینک" });
  await expect(form).toBeVisible();
  await form.getByRole("textbox", { name: "نشانی" }).fill("https://example.org");
  await form.getByRole("button", { name: "ثبت" }).click();
  await expect(page.locator('.tm-editor a[href="https://example.org"]')).toBeVisible();
});

test("★ چک‌لیست با کلیک واقعاً تغییر می‌کند", async ({ page }) => {
  const button = page.locator(".tm-task-checkbox").first();
  const item = page.locator(".tm-editor li[data-checked]").first();
  await expect(button).toHaveAttribute("aria-checked", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-checked", "true");
  await expect(item).toHaveAttribute("data-checked", "true");
});

test("★ ابزارِ جدول فقط داخلِ جدول می‌آید و ردیف اضافه می‌کند", async ({ page }) => {
  await expect(page.getByRole("toolbar", { name: "ابزارِ جدول" })).toHaveCount(0);
  const table = page.locator(".tm-editor table");
  await table.locator("td").first().click();
  const tools = page.getByRole("toolbar", { name: "ابزارِ جدول" });
  await expect(tools).toBeVisible();
  await expect(table.locator("tr")).toHaveCount(3);
  await tools.getByRole("button", { name: "ردیف بعد" }).click();
  await expect(table.locator("tr")).toHaveCount(4);
});

test("★ منوی Paragraph گزینه‌های Typora را دسته‌بندی می‌کند", async ({ page }) => {
  const paragraphTrigger = page.getByRole("button", { name: "پاراگراف" });
  const toolbar = page.getByRole("toolbar", { name: "ابزارِ قالب‌بندی" });

  // منوی بلوکی یک ردیفِ مستقل بالای نوارِ سریعِ کامل است.
  const [paragraphBox, toolbarBox] = await Promise.all([
    paragraphTrigger.boundingBox(),
    toolbar.boundingBox(),
  ]);
  expect(paragraphBox).not.toBeNull();
  expect(toolbarBox).not.toBeNull();
  expect(paragraphBox!.y + paragraphBox!.height).toBeLessThanOrEqual(toolbarBox!.y);

  // اپ عمداً نوارِ سریع compact دارد؛ ابزارهای بلوکی در منوی Paragraph‌اند.
  await expect(toolbar.getByRole("button", { name: /پررنگ/ })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: /عنوانِ ۱/ })).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: /فهرستِ نقطه‌ای/ })).toHaveCount(0);

  await paragraphTrigger.click();
  const menu = page.getByRole("menu", { name: "پاراگراف" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "عنوان 6" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "فهرست شماره‌دار" })).toBeVisible();
  await page.keyboard.press("Escape");

  // عناصرِ درج‌شدنی در منوی مستقلِ «درج» قرار دارند.
  await page.getByRole("button", { name: "درج", exact: true }).click();
  const insert = page.getByRole("menu", { name: "درج" });
  await expect(insert.getByRole("menuitem", { name: /فرمول ریاضی/ })).toBeVisible();
  await expect(insert.getByRole("menuitem", { name: "پانویس" })).toBeVisible();
  await expect(insert.getByRole("menuitem", { name: "فهرست مطالب" })).toBeVisible();

  await insert.getByRole("menuitem", { name: "کادر اطلاع‌رسانی" }).click();
  const alerts = page.getByRole("menu", { name: "کادر اطلاع‌رسانی" });
  await expect(alerts.getByRole("menuitem", { name: "یادداشت (Note)" })).toBeVisible();
  await expect(alerts.getByRole("menuitem", { name: "احتیاط (Caution)" })).toBeVisible();
});

test("★ منوی Format قالب‌های Typora و منوی Insert درج تصویر را اجرا می‌کند", async ({ page }) => {
  const paragraph = page.locator(".tm-editor p", { hasText: "پررنگ" }).first();
  await paragraph.click();
  await page.evaluate(() => {
    const node = [...document.querySelectorAll(".tm-editor p")]
      .find((element) => element.textContent?.includes("پررنگ"))?.firstChild;
    if (!node) throw new Error("متن پیدا نشد");
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, Math.min(4, node.textContent?.length ?? 0));
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });

  await page.getByRole("button", { name: "قالب" }).click();
  const format = page.getByRole("menu", { name: "قالب" });
  await expect(format.getByRole("menuitemcheckbox", { name: /زیرخط/ })).toBeVisible();
  await expect(format.getByRole("menuitemcheckbox", { name: /توضیح پنهان/ })).toBeVisible();
  await format.getByRole("menuitemcheckbox", { name: /زیرخط/ }).click();
  await expect(paragraph.locator("u")).toHaveCount(1);

  await page.getByRole("button", { name: "درج", exact: true }).click();
  await page.getByRole("menuitem", { name: "تصویر" }).click();
  await page.getByRole("menuitem", { name: /از نشانی اینترنتی/ }).click();
  const form = page.getByRole("form", { name: "درجِ تصویر" });
  await form.getByRole("textbox", { name: "متن جایگزین" }).fill("نمونه");
  await form.getByRole("textbox", { name: "نشانی تصویر" }).fill("https://example.com/a.png");
  await form.getByRole("button", { name: "درج" }).click();
  await expect(page.locator('.tm-editor img[alt="نمونه"]')).toHaveCount(1);
});

test("★ منوی View حالت‌های نمایشیِ قابل‌انتقال را کنترل می‌کند", async ({ page }) => {
  await expect(page.getByRole("complementary", { name: "پنلِ ساختار" })).toBeVisible();
  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  const viewMenu = page.getByRole("menu", { name: "نمایش" });
  await expect(viewMenu.getByRole("menuitemcheckbox", { name: /حالت تمرکز/ })).toBeVisible();
  await viewMenu.getByRole("menuitemcheckbox", { name: /نمایش نوار کناری/ }).click();
  await expect(page.getByRole("complementary", { name: "پنلِ ساختار" })).toHaveCount(0);

  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  await page.getByRole("menuitem", { name: /بزرگ‌نمایی/ }).click();
  await expect(page.locator(".tm-editor-wrap")).toHaveCSS("zoom", "1.1");

  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: /پنجرهٔ شمارش کلمات/ }).click();
  await expect(page.getByRole("complementary", { name: "شمارش کلمات" })).toContainText("کلمه");
});

test("★ منوی File سند را ذخیره، خالی و از فایل باز می‌کند", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined, configurable: true });
  });
  await page.reload();
  await page.waitForSelector(".tm-editor", { timeout: 25000 });

  await page.getByRole("button", { name: "فایل" }).click();
  const fileMenu = page.getByRole("menu", { name: "فایل" });
  await expect(fileMenu.getByRole("menuitem", { name: "سند جدید" })).toBeVisible();
  await expect(fileMenu.getByRole("menuitem", { name: "بازکردن…" })).toBeVisible();
  await expect(fileMenu.getByRole("menuitem", { name: "خروجی" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await fileMenu.getByRole("menuitem", { name: /^ذخیره Ctrl/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("document.md");

  await page.getByRole("button", { name: "فایل" }).click();
  await page.getByRole("menuitem", { name: "سند جدید" }).click();
  await expect(page.locator(".tm-editor")).toHaveText("");

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "فایل" }).click();
  await page.getByRole("menuitem", { name: "بازکردن…" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "opened.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# سند بازشده\n\nمتن فایل\n"),
  });
  await expect(page.locator(".tm-editor h1")).toContainText("سند بازشده");
  await expect(page.locator(".tm-editor")).toContainText("متن فایل");

  await page.getByRole("button", { name: "حالتِ سورس" }).click();
  await page.getByRole("textbox", { name: "متنِ خامِ مارک‌داون" }).fill("# سند بازشده\n\nمتن ویرایش‌شده\n");
  const updatedDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "فایل" }).click();
  await page.getByRole("menuitem", { name: /^ذخیره Ctrl/ }).click();
  const updatedDownload = await updatedDownloadPromise;
  const updatedPath = await updatedDownload.path();
  expect(updatedPath).not.toBeNull();
  await expect(page.getByRole("status")).toContainText("پوشهٔ دانلودها");
  expect(await readFile(updatedPath!, "utf8")).toContain("متن ویرایش‌شده");
});

test("★ ذخیرهٔ فایل بازشده مجوز نوشتن می‌گیرد و همان فایل را به‌روزرسانی می‌کند", async ({ page }) => {
  await page.addInitScript(() => {
    const state = { permissionRequests: 0, writes: [] as string[] };
    let content = "# سند بازشده\n\nمتن اولیه\n";
    Object.defineProperty(window, "__nilaSaveState", { value: state, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", {
      configurable: true,
      value: async () => [{
        kind: "file",
        name: "opened.md",
        getFile: async () => new File([content], "opened.md", { type: "text/markdown", lastModified: Date.now() }),
        requestPermission: async () => {
          state.permissionRequests += 1;
          return "granted";
        },
        createWritable: async () => ({
          write: async (value: string | Blob) => {
            content = typeof value === "string" ? value : await value.text();
            state.writes.push(content);
          },
          close: async () => undefined,
        }),
      }],
    });
  });
  await page.reload();
  await page.waitForSelector(".tm-editor", { timeout: 25000 });

  await page.getByRole("button", { name: "فایل" }).click();
  await page.getByRole("menuitem", { name: "بازکردن…" }).click();
  await expect(page.locator(".tm-editor")).toContainText("متن اولیه");

  await page.getByRole("button", { name: "حالتِ سورس" }).click();
  await page.getByRole("textbox", { name: "متنِ خامِ مارک‌داون" }).fill("# سند بازشده\n\nمتن ذخیره‌شده\n");
  await page.getByRole("button", { name: "فایل" }).click();
  await page.getByRole("menuitem", { name: /^ذخیره Ctrl/ }).click();
  await expect(page.getByRole("status")).toContainText("ذخیره انجام شد");

  const state = await page.evaluate(() => (window as unknown as {
    __nilaSaveState: { permissionRequests: number; writes: string[] };
  }).__nilaSaveState);
  expect(state.permissionRequests).toBe(1);
  expect(state.writes.at(-1)).toContain("متن ذخیره‌شده");
});

test("★ منوی Edit تکثیر، undo و پنلِ جایگزینی را اجرا می‌کند", async ({ page }) => {
  const target = page.locator(".tm-editor p", { hasText: "این بخشنامه در اجرای" }).first();
  await target.click();
  const initialCount = await page.locator(".tm-editor p", { hasText: "این بخشنامه در اجرای" }).count();

  await page.getByRole("button", { name: "ویرایش" }).click();
  const editMenu = page.getByRole("menu", { name: "ویرایش" });
  await expect(editMenu.getByRole("menuitem", { name: "کپی به‌عنوان" })).toBeVisible();
  await editMenu.getByRole("menuitem", { name: "ساخت نسخه مشابه" }).click();
  await expect(page.locator(".tm-editor p", { hasText: "این بخشنامه در اجرای" })).toHaveCount(initialCount + 1);

  await page.getByRole("button", { name: "ویرایش" }).click();
  await page.getByRole("menuitem", { name: /برگرداندن/ }).click();
  await expect(page.locator(".tm-editor p", { hasText: "این بخشنامه در اجرای" })).toHaveCount(initialCount);

  await page.getByRole("button", { name: "ویرایش" }).click();
  await page.getByRole("menuitem", { name: "جست‌وجو و جایگزینی" }).click();
  await page.getByRole("menuitem", { name: /^جایگزینی/ }).click();
  const searchPanel = page.getByRole("search");
  await expect(searchPanel).toBeVisible();
  await expect(searchPanel.getByRole("textbox", { name: "متنِ جایگزین" })).toBeVisible();
});

test("★ ارجاع لینک از منوی Insert ساخته می‌شود", async ({ page }) => {
  const paragraph = page.locator(".tm-editor p", { hasText: "پررنگ" }).first();
  await paragraph.click();
  await page.getByRole("button", { name: "درج", exact: true }).click();
  await page.getByRole("menuitem", { name: /پیوند ارجاعی/ }).click();

  const form = page.getByRole("form", { name: "درجِ ارجاعِ لینک" });
  await expect(form).toBeVisible();
  await form.getByRole("textbox", { name: "شناسه" }).fill("منبع-آزمایشی");
  await form.getByRole("textbox", { name: "نشانی" }).fill("https://example.org/reference");
  await form.getByRole("button", { name: "ثبت" }).click();
  await expect(page.locator('.tm-editor a[href="https://example.org/reference"]')).toBeVisible();
  await expect(page.locator(".tm-link-definition")).toContainText("منبع-آزمایشی");
});

test("★ هر فهرستِ تودرتو مثل نودِ والد باز و بسته می‌شود", async ({ page }) => {
  await page.goto("/markdown?fixture=demo&folding=true");
  await page.waitForSelector(".tm-editor");
  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  await page.getByRole("menuitem", { name: "بازکردن همهٔ بخش‌ها" }).click();
  const toggle = page.locator(".tm-list-fold-toggle").first();
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".tm-list-folded-hidden").first()).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
});
