import { test, expect } from "@playwright/test";

/**
 * درختِ ساختار و تاشدنِ فصل.
 *
 * ★ هر دو باگی که اینجا تست می‌شوند، **دیداری** بودند و از دیدِ
 * تست‌های ساختاری نامرئی: درخت از اول درست ساخته می‌شد ولی هم‌ترازی،
 * چسبیدن statusbar و امکانِ تاشدنِ عنوانِ دارای متن فقط در مرورگرِ واقعی
 * قابلِ اثبات‌اند.
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
  // تعدادِ زیرگره‌های ساختاری نباید هم‌ترازیِ عنوان را عوض کند.
  expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
});

test("★ همهٔ بخش‌های دارای متن دکمهٔ تاشدنِ هم‌اندازه دارند", async ({ page }) => {
  const toggles = page.locator(".tm-outline .tm-fold-toggle");
  await expect(toggles).toHaveCount(2);
  const widths = await toggles.evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().width)),
  );
  expect(new Set(widths).size).toBe(1);
});

test("★ سرفصل در خودِ متن مثلثِ تاشدن دارد", async ({ page }) => {
  const h1 = page.locator(".tm-editor h1").first();
  const handle = h1.locator(".tm-inline-fold");
  await expect(handle).toBeAttached();

  // نودِ والد بدون نیاز به hover هم باید قابلِ تشخیص باشد.
  await expect(handle).toHaveCSS("opacity", "1");

  // با hover دیده می‌شود.
  await h1.hover();
  await expect(handle).toHaveCSS("opacity", "1");
});

test("★★ کلیک روی مثلثِ متن، فصل را می‌بندد و باز می‌کند", async ({ page }) => {
  const h1 = page.locator(".tm-editor h1").first();
  const handle = h1.locator(".tm-inline-fold");

  // ★ حالت روی **خودِ سرفصل** است نه روی دکمه — دلیلش در `fold.ts`
  // کنارِ `foldState` نوشته شده.
  await expect(h1).toHaveAttribute("data-folded", "true");

  await h1.hover();
  await handle.click();

  await expect(h1).toHaveAttribute("data-folded", "false");
  await expect(h1).toHaveAttribute("aria-expanded", "true");

  await h1.hover();
  await handle.click();

  await expect(h1).toHaveAttribute("data-folded", "true");
  await expect(page.locator(".tm-fold-summary").first()).toBeVisible();
});

test("★ باز و بسته‌شدن پشتِ‌هم پایدار است", async ({ page }) => {
  // ★ این تست از یک باگِ واقعی آمده: نسخهٔ اول فقط **یک‌بار** بسته
  // می‌شد و دیگر باز نمی‌شد، چون `Decoration.node` بینِ `mousedown` و
  // `mouseup` دکمه را جایگزین می‌کرد و `click` هرگز کامل نمی‌شد.
  const h1 = page.locator(".tm-editor h1").first();
  const handle = h1.locator(".tm-inline-fold");

  for (const expected of ["false", "true", "false", "true"]) {
    await h1.hover();
    await handle.click();
    await expect(h1).toHaveAttribute("data-folded", expected);
  }
});

test("★ بستنِ فصل، سرفصلش را پنهان نمی‌کند", async ({ page }) => {
  const h1 = page.locator(".tm-editor h1").first();
  const text = (await h1.innerText()).trim();

  await expect(h1).toHaveAttribute("data-folded", "true");

  // وگرنه کاربر چیزی برای کلیک‌کردن و بازکردن ندارد.
  await expect(h1).toContainText(text.replace(/^⌄\s*/, ""));
});

test("★ خلاصه هم فصل را باز می‌کند", async ({ page }) => {
  const h1 = page.locator(".tm-editor h1").first();
  await expect(h1).toHaveAttribute("data-folded", "true");

  await page.locator(".tm-fold-summary").first().click();
  await expect(h1).toHaveAttribute("data-folded", "false");
});

test("★★ با مکان‌نمای داخلِ بخش هم فلش واقعاً آن را می‌بندد", async ({ page }) => {
  const h1 = page.locator(".tm-editor h1").first();
  await h1.locator(".tm-inline-fold").click();
  const body = page.locator(".tm-editor p", { hasText: "این بخشنامه در اجرای" }).first();
  await body.click();
  await h1.hover();
  await h1.locator(".tm-inline-fold").click();
  await expect(h1).toHaveAttribute("data-folded", "true");
  await expect(body).toBeHidden();
});

test("★★ بازکردنِ یک عنوانِ هم‌سطح، عنوانِ قبلی را می‌بندد", async ({ page }) => {
  const roots = page.locator(".tm-editor h1");
  const first = roots.nth(0);
  const second = roots.nth(1);
  await first.locator(".tm-inline-fold").click();
  await expect(first).toHaveAttribute("data-folded", "false");
  await second.locator(".tm-inline-fold").click();
  await expect(second).toHaveAttribute("data-folded", "false");
  await expect(first).toHaveAttribute("data-folded", "true");
});

test("★★ تاشدن وارد مارک‌داون نمی‌شود", async ({ page }) => {
  const output = page.getByTestId("markdown-output");
  const before = await output.textContent();

  const h1 = page.locator(".tm-editor h1").first();
  await h1.hover();
  await h1.locator(".tm-inline-fold").click();
  await expect(h1).toHaveAttribute("data-folded", "false");
  await page.waitForTimeout(600);

  // ★ حالتِ نمایش هرگز نباید در سند بنشیند — وگرنه رفت‌وبرگشت می‌شکند.
  expect(await output.textContent()).toBe(before);
});

test("★★ همهٔ کارت‌های دارای زیرمجموعه نودِ بازوبسته‌شونده‌اند", async ({ page }) => {
  const cards = page.locator(".tm-mark");
  const toggles = cards.locator(":scope > .tm-mark-header > .tm-fold-toggle");
  await expect(toggles).toHaveCount(await cards.count());

  // در اجرای اول همهٔ کارت‌ها بسته‌اند.
  await expect(toggles.first()).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  await page.getByRole("menuitem", { name: "بازکردن همهٔ بخش‌ها" }).click();

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

test("★★ اجرای اول همهٔ عنوان‌ها، فهرست‌ها و کارت‌ها بسته‌اند", async ({ page }) => {
  const headings = page.locator(".tm-editor :is(h1,h2,h3,h4,h5,h6)[data-folded]");
  expect(await headings.count()).toBeGreaterThan(0);
  await expect(headings.first()).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".tm-list-fold-toggle").first()).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".tm-mark > .tm-mark-header > .tm-fold-toggle").first()).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.locator(".tm-code").first()).toBeHidden();
  await expect(page.locator(".tm-editor table")).toBeHidden();
  await expect(page.locator(".tm-math-block").first()).toBeHidden();
});

test("★★ در حالت تمرکز، کلیک Outline خودِ عنوان را به دید می‌آورد", async ({ page }) => {
  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  await page.getByRole("menuitem", { name: "بازکردن همهٔ بخش‌ها" }).click();
  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: /حالت تمرکز/ }).click();

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('[data-outline-id="amnیت"], [data-outline-id="امنیت"]').first().click();
  const heading = page.locator(".tm-editor h2", { hasText: "امنیت" });
  await expect(heading).toBeInViewport();
  const box = await heading.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeLessThan(page.viewportSize()!.height * 0.8);
});

test("★★ جست‌وجو هنگام اسکرول روی صفحه می‌ماند", async ({ page }) => {
  await page.getByRole("button", { name: "ویرایش" }).click();
  await page.getByRole("menuitem", { name: "جست‌وجو و جایگزینی" }).click();
  await page.getByRole("menuitem", { name: /^جست‌وجو Ctrl/ }).click();
  const search = page.getByRole("search");
  await expect(search).toBeVisible();
  const before = await search.boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(search).toBeInViewport();
  const after = await search.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(2);
});

test("★★ رابط دو زبانه است و جهت هر بلوک مستقل تشخیص داده می‌شود", async ({ page }) => {
  const root = page.locator(".tm-root");
  await expect(root).toHaveAttribute("lang", "fa");
  await expect(root).toHaveAttribute("dir", "rtl");
  await expect(page.locator('.tm-editor [data-auto-dir="true"][dir="rtl"]').first()).toBeAttached();
  await expect(page.locator('.tm-editor [data-auto-dir="true"][dir="ltr"]').first()).toBeAttached();

  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "انگلیسی" }).click();
  await expect(root).toHaveAttribute("lang", "en");
  await expect(root).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("button", { name: "File" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Paragraph" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Format" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View" })).toBeVisible();
  await expect(page.locator(".tm-code .tm-code-copy").first()).toHaveText("Copy");
  await expect(page.locator(".tm-task-checkbox").first()).toHaveAttribute(
    "aria-label",
    /Mark as (completed|incomplete)/,
  );
});

test("★ در فارسی پنلِ ساختار سمت راست و در انگلیسی سمت چپ است", async ({ page }) => {
  await expect(page.locator(".markdown-workspace")).toBeVisible();
  await expect(page.getByRole("heading", { name: "@tamin/markdown" })).toHaveCount(0);

  const [workspace, sidebar, editor] = await Promise.all([
    page.locator(".markdown-workspace").boundingBox(),
    page.locator(".tm-sidebar").boundingBox(),
    page.locator(".tm-main").boundingBox(),
  ]);
  expect(workspace?.height).toBeGreaterThanOrEqual(700);
  expect(sidebar!.x).toBeGreaterThan(editor!.x);
  expect(Math.abs(sidebar!.height - workspace!.height)).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "انگلیسی" }).click();
  const [englishSidebar, englishEditor] = await Promise.all([
    page.locator(".tm-sidebar").boundingBox(),
    page.locator(".tm-main").boundingBox(),
  ]);
  expect(englishSidebar!.x).toBeLessThan(englishEditor!.x);
});

test("★★ دکمهٔ همبرگری پنلِ ساختار را می‌بندد و باز می‌کند", async ({ page }) => {
  const close = page.getByRole("button", { name: "بستن پنل ساختار" });
  await expect(close).toBeVisible();
  await expect(page.locator(".tm-sidebar").getByRole("button", { name: "بستن پنل ساختار" })).toBeVisible();
  await expect(page.locator(".tm-top-menu-row").getByRole("button", { name: "بستن پنل ساختار" })).toHaveCount(0);
  await close.click();
  await expect(page.getByRole("complementary", { name: "پنلِ ساختار" })).toHaveCount(0);
  await expect(page.getByRole("separator", { name: "تغییر عرض پنل ساختار" })).toHaveCount(0);

  const open = page.getByRole("button", { name: "بازکردن پنل ساختار" });
  await open.click();
  await expect(page.getByRole("complementary", { name: "پنلِ ساختار" })).toBeVisible();
});

test("★★ عنوانِ دارای متن از خودِ Outline هم باز و بسته می‌شود", async ({ page }) => {
  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  await page.getByRole("menuitem", { name: "بازکردن همهٔ بخش‌ها" }).click();
  const item = page.locator('[data-outline-id="fasl-1"]');
  const toggle = item.getByRole("button", { name: /بستنِ فصل اول/ });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator(".tm-editor h1").first()).toHaveAttribute("data-folded", "true");
  await item.getByRole("button", { name: /بازکردنِ فصل اول/ }).click();
  await expect(page.locator(".tm-editor h1").first()).toHaveAttribute("data-folded", "false");
});

test("★★ نوارِ وضعیت همیشه به لبهٔ پایین صفحه چسبیده است", async ({ page }) => {
  const main = page.locator(".tm-main");
  const status = page.locator(".tm-main > .tm-stats");
  const bottoms = async () => Promise.all([
    main.evaluate((element) => Math.round(element.getBoundingClientRect().bottom)),
    status.evaluate((element) => Math.round(element.getBoundingClientRect().bottom)),
  ]);
  let [mainBottom, statusBottom] = await bottoms();
  expect(Math.abs(mainBottom - statusBottom)).toBeLessThanOrEqual(1);
  await main.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  [mainBottom, statusBottom] = await bottoms();
  expect(Math.abs(mainBottom - statusBottom)).toBeLessThanOrEqual(1);
});

test("★★ عرضِ پنل با ماوس و کیبورد تغییر می‌کند", async ({ page }) => {
  const sidebar = page.locator(".tm-sidebar");
  const resizer = page.getByRole("separator", { name: "تغییر عرض پنل ساختار" });
  const before = await sidebar.boundingBox();
  const handle = await resizer.boundingBox();

  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + 100);
  await page.mouse.down();
  await page.mouse.move(handle!.x - 80, handle!.y + 100);
  await page.mouse.up();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThan(before!.width + 60);

  const afterMouse = (await sidebar.boundingBox())!.width;
  await resizer.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(afterMouse);
});
