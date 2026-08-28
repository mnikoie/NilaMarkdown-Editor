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
  await page.goto("/markdown?fixture=demo");
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
  await expect(page.locator(".tm-fold-summary")).toHaveCount(0);
});

test("★★ بخشِ باز کارتِ حرفه‌ای و ریلِ ظریف دارد، نه قابِ تو‌در‌تو", async ({ page }) => {
  const heading = page.locator(".tm-editor h1").first();
  await heading.locator(".tm-inline-fold").click();
  await expect(heading).toHaveAttribute("data-folded", "false");

  const frame = page.locator(".tm-section-frame").first();
  await expect(frame).toBeAttached();

  const visual = await heading.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      radius: Number.parseFloat(style.borderRadius),
      shadow: style.boxShadow,
    };
  });
  expect(visual.radius).toBeGreaterThanOrEqual(12);
  expect(visual.shadow).not.toBe("none");

  const borders = await frame.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      top: Number.parseFloat(style.borderTopWidth),
      bottom: Number.parseFloat(style.borderBottomWidth),
      left: Number.parseFloat(style.borderLeftWidth),
      right: Number.parseFloat(style.borderRightWidth),
    };
  });
  expect(borders.top).toBe(0);
  expect(borders.bottom).toBe(0);
  expect(Math.max(borders.left, borders.right)).toBeGreaterThan(0);
  expect(Math.min(borders.left, borders.right)).toBe(0);

  const [headingBox, frameBox] = await Promise.all([heading.boundingBox(), frame.boundingBox()]);
  expect(headingBox).not.toBeNull();
  expect(frameBox).not.toBeNull();
  // ریل از زیرِ کارت شروع می‌شود و دیگر دورِ خودِ عنوان کادر نمی‌کشد.
  expect(frameBox!.y).toBeGreaterThanOrEqual(headingBox!.y + headingBox!.height);
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

test("★ chevron همان فصل را دوباره باز می‌کند", async ({ page }) => {
  const h1 = page.locator(".tm-editor h1").first();
  await expect(h1).toHaveAttribute("data-folded", "true");

  await h1.locator(".tm-inline-fold").click();
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

test("★★ تمامِ سربرگِ کارت در مرورگرهای واقعی باز و بسته می‌شود", async ({ page }) => {
  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  await page.getByRole("menuitem", { name: "بازکردن همهٔ بخش‌ها" }).click();

  const card = page.locator('.tm-mark[data-mark="ماده"]').first();
  const header = card.locator(":scope > .tm-mark-header");
  const toggle = header.locator(":scope > .tm-fold-toggle");
  const id = await card.getAttribute("data-fold-id");
  expect(id).toBeTruthy();

  await header.click({ position: { x: 100, y: 10 } });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(card.locator(":scope > .tm-mark-body")).toBeHidden();

  await header.click({ position: { x: 100, y: 10 } });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(card.locator(":scope > .tm-mark-body")).toBeVisible();
  await expect(page.locator(`.tm-fold-summary[data-fold-id="${id}"]`)).toHaveCount(0);
});

test("★★ کارتِ ماده و Outline در هر دو جهت یک state دارند", async ({ page }) => {
  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  await page.getByRole("menuitem", { name: "بازکردن همهٔ بخش‌ها" }).click();

  const card = page.locator('.tm-mark[data-mark="ماده"]').first();
  const id = await card.getAttribute("data-fold-id");
  expect(id).toBeTruthy();
  const outlineItem = page.locator(`[data-outline-id="${id}"]`);
  const outlineToggle = outlineItem.locator(":scope > .tm-fold-toggle");

  await outlineToggle.click();
  await expect(card).toHaveAttribute("data-folded", "true");
  await expect(card.locator(":scope > .tm-mark-body")).toBeHidden();

  await outlineToggle.click();
  await expect(card).toHaveAttribute("data-folded", "false");
  await expect(card.locator(":scope > .tm-mark-body")).toBeVisible();
  await expect(page.locator(`.tm-fold-summary[data-fold-id="${id}"]`)).toHaveCount(0);

  await card.locator(":scope > .tm-mark-header").click({ position: { x: 100, y: 10 } });
  await expect(outlineToggle).toHaveAttribute("aria-expanded", "false");
  await card.locator(":scope > .tm-mark-header").click({ position: { x: 100, y: 10 } });
  await expect(outlineToggle).toHaveAttribute("aria-expanded", "true");
});

test("★★ آکاردئون همهٔ کارت‌های خواهر را همگام می‌بندد و خلاصهٔ جعلی نمی‌سازد", async ({ page }) => {
  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  await page.getByRole("menuitem", { name: "بازکردن همهٔ بخش‌ها" }).click();

  const article39 = page.locator('.tm-mark[data-mark="ماده"]').filter({ hasText: "ماده ۳۹" });
  const articleToggle = article39.locator(":scope > .tm-mark-header > .tm-fold-toggle");
  const articleBody = article39.locator(":scope > .tm-mark-body");
  await expect(articleToggle).toHaveAttribute("aria-expanded", "true");
  await expect(articleBody).toBeVisible();

  // «فهرست‌ها» را می‌بندیم و دوباره باز می‌کنیم. بازشدنش در حالتِ
  // آکاردئون مادهٔ ۳۹ را به‌عنوانِ خواهر می‌بندد؛ همان مسیرِ باگِ واقعی.
  const listsHeading = page.locator(".tm-editor h2", { hasText: "فهرست‌ها" });
  await listsHeading.locator(".tm-inline-fold").click();
  await expect(listsHeading).toHaveAttribute("data-folded", "true");
  await listsHeading.locator(".tm-inline-fold").click();

  await expect(listsHeading).toHaveAttribute("data-folded", "false");
  await expect(listsHeading).toHaveAttribute("aria-expanded", "true");
  await expect(article39).toHaveAttribute("data-folded", "true");
  await expect(articleToggle).toHaveAttribute("aria-expanded", "false");
  await expect(articleBody).toBeHidden();
  await expect(article39.locator(".tm-fold-summary")).toHaveCount(0);
});

test("★★ کلیک و تایپ در بدنهٔ کارت آن را ناخواسته نمی‌بندد", async ({ page }) => {
  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  await page.getByRole("menuitem", { name: "بازکردن همهٔ بخش‌ها" }).click();

  const card = page.locator('.tm-mark[data-mark="تبصره"]').filter({ hasText: "جریمه" });
  const body = card.locator(":scope > .tm-mark-body");
  const paragraph = body.locator("p", { hasText: "جریمه" });
  await paragraph.click();
  await page.keyboard.type("آزمایش");

  await expect(card.locator(":scope > .tm-mark-header > .tm-fold-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(body).toBeVisible();
  await expect(paragraph).toContainText("آزمایش");
  await expect(page.getByTestId("markdown-output")).toContainText("آزمایش");
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

test("★★ chevron فهرست در RTL و LTR جهت عمودیِ یکسان دارد", async ({ page }) => {
  const toggle = page.locator(".tm-list-fold-toggle").first();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const rtlTransform = await toggle.evaluate((element) => getComputedStyle(element).transform);

  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "انگلیسی" }).click();
  await expect(page.locator(".tm-root")).toHaveAttribute("dir", "ltr");
  expect(await toggle.evaluate((element) => getComputedStyle(element).transform)).toBe(rtlTransform);
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

test("★★ کلیک روی آیتمِ فهرست، آغازِ همان آیتم را زیرِ نوار ابزار نشان می‌دهد", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "جست‌وجو در ساختار" });
  await search.fill("۲. دوم");

  const outlineItem = page.getByRole("treeitem", { name: "۲. دوم", exact: true });
  await outlineItem.click();

  const target = page.locator(".tm-editor ol > li").filter({ hasText: "دوم" }).first();
  const controls = page.locator(".tm-main > .tm-editor-controls");
  await expect(target).toBeInViewport();
  await expect(outlineItem).toHaveAttribute("aria-selected", "true");

  const [targetBox, controlsBox] = await Promise.all([target.boundingBox(), controls.boundingBox()]);
  expect(targetBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  expect(targetBox!.y).toBeGreaterThanOrEqual(controlsBox!.y + controlsBox!.height + 8);
  expect(targetBox!.y).toBeLessThanOrEqual(controlsBox!.y + controlsBox!.height + 24);
});

test("★★ کلیک Outline در نمایش سورس، خطِ مقصد را از بالای صفحه نشان می‌دهد", async ({ page }) => {
  await page.getByRole("button", { name: "حالتِ سورس" }).click();

  const search = page.getByRole("searchbox", { name: "جست‌وجو در ساختار" });
  await search.fill("۲. دوم");
  await page.getByRole("treeitem", { name: "۲. دوم", exact: true }).click();

  const metrics = await page.locator(".tm-source").evaluate((source: HTMLTextAreaElement) => {
    const selectedLine = source.value.slice(source.selectionStart, source.selectionEnd);
    const computed = getComputedStyle(source);
    const mirror = document.createElement("div");
    Object.assign(mirror.style, {
      position: "fixed",
      inset: "0 auto auto -100000px",
      visibility: "hidden",
      pointerEvents: "none",
      boxSizing: "border-box",
      width: `${source.clientWidth}px`,
      border: "0",
      whiteSpace: "pre-wrap",
    });
    for (const property of [
      "font-family", "font-size", "font-style", "font-weight", "font-stretch",
      "letter-spacing", "line-height", "padding-block-start", "padding-block-end",
      "padding-inline-start", "padding-inline-end", "text-align", "text-indent",
      "text-transform", "word-break", "overflow-wrap", "tab-size", "direction",
    ]) mirror.style.setProperty(property, computed.getPropertyValue(property));
    mirror.append(document.createTextNode(source.value.slice(0, source.selectionStart)));
    const marker = document.createElement("span");
    marker.textContent = "\u200b";
    mirror.append(marker);
    document.body.append(mirror);
    const expectedScrollTop = marker.offsetTop - (Number.parseFloat(computed.paddingTop) || 0);
    mirror.remove();
    return { selectedLine, scrollTop: source.scrollTop, expectedScrollTop };
  });

  expect(metrics.selectedLine).toContain("2. دوم");
  expect(Math.abs(metrics.scrollTop - metrics.expectedScrollTop)).toBeLessThanOrEqual(2);
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

test("★★ دستگیرهٔ تغییر عرض کوتاه و خنثی است، نه خطِ آبیِ تمام‌قد", async ({ page }) => {
  const resizer = page.getByRole("separator", { name: "تغییر عرض پنل ساختار" });
  const idle = await resizer.evaluate((element) => {
    const style = getComputedStyle(element, "::after");
    return {
      width: Number.parseFloat(style.width),
      height: Number.parseFloat(style.height),
      background: style.backgroundColor,
      accent: getComputedStyle(element.closest(".tm-root")!).getPropertyValue("--tm-accent").trim(),
    };
  });
  expect(idle.width).toBeLessThanOrEqual(6);
  expect(idle.height).toBeGreaterThanOrEqual(40);
  expect(idle.height).toBeLessThanOrEqual(72);
  expect(idle.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(idle.background).not.toBe(idle.accent);

  await resizer.hover();
  const hoverHeight = await resizer.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element, "::after").height),
  );
  expect(hoverHeight).toBeLessThanOrEqual(80);
});

test("★★ متن بلند هنگامِ باز و بسته‌شدن، نقطهٔ خواندن را نگه می‌دارد و کامل باز می‌شود", async ({ page, browserName }) => {
  const markdown = Array.from(
    { length: 18 },
    (_, index) => `# بخش ${index + 1}\n\n${Array.from(
      { length: 18 },
      (_, paragraph) => `پاراگراف بلند ${paragraph + 1} برای بررسی کامل نمایش محتوا در بخش ${index + 1}.`,
    ).join("\n\n")}`,
  ).join("\n\n");

  await page.getByRole("button", { name: "حالتِ سورس (Ctrl+/)" }).click();
  await page.locator("textarea").fill(markdown);
  await page.getByRole("button", { name: "حالتِ ویرایش (Ctrl+/)" }).click();
  await expect(page.locator(".tm-editor h1")).toHaveCount(18);

  const main = page.locator(".tm-main");
  const heading = page.locator(".tm-editor h1").nth(9);
  const handle = heading.locator(".tm-inline-fold");
  const id = await handle.getAttribute("data-fold-id");
  expect(id).toBeTruthy();

  await handle.click();
  await page.waitForTimeout(250);
  await main.evaluate((element, foldId) => {
    const target = [...document.querySelectorAll<HTMLElement>(".tm-editor h1")]
      .find((item) => item.querySelector<HTMLElement>(".tm-inline-fold")?.dataset.foldId === foldId);
    if (target) element.scrollTop += target.getBoundingClientRect().top - element.getBoundingClientRect().top - 280;
  }, id);
  const before = await main.evaluate((element, foldId) => {
    const target = [...document.querySelectorAll<HTMLElement>(".tm-editor h1")]
      .find((item) => item.querySelector<HTMLElement>(".tm-inline-fold")?.dataset.foldId === foldId);
    return target?.getBoundingClientRect().top;
  }, id);

  await handle.click();
  await page.waitForTimeout(350);
  const after = await main.evaluate((element, foldId) => {
    const target = [...document.querySelectorAll<HTMLElement>(".tm-editor h1")]
      .find((item) => item.querySelector<HTMLElement>(".tm-inline-fold")?.dataset.foldId === foldId);
    return target?.getBoundingClientRect().top;
  }, id);
  // WebKit هنگام تغییر display یک تصحیح داخلی به‌اندازهٔ تقریباً یک خط
  // انجام می‌دهد؛ در سایر موتورها نقطه باید پیکسلی ثابت بماند.
  expect(Math.abs((after ?? 0) - (before ?? 0))).toBeLessThanOrEqual(browserName === "webkit" ? 48 : 2);
  await expect(page.getByText("پاراگراف بلند 18 برای بررسی کامل نمایش محتوا در بخش 10.", { exact: true })).toBeVisible();

  for (let index = 0; index < 8; index++) await handle.click();
  await expect(heading).toHaveAttribute("aria-expanded", "true");
});

test("★★ کنترل‌های تاشدن روی موبایل کوچک، واضح و قابل‌کلیک می‌مانند", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "بستن پنل ساختار" }).click();
  const heading = page.locator(".tm-editor h1").first();
  await expect(heading).toHaveAttribute("aria-expanded", "false");
  await heading.locator(".tm-inline-fold").click();
  await expect(heading).toHaveAttribute("aria-expanded", "true");
  await expect(heading.locator(".tm-inline-fold")).toBeVisible();
});

test("★★ حالت‌های ویرایش و سورس تمام سطح را می‌گیرند و جهتِ سورس زبانی است", async ({ page }) => {
  const main = page.locator(".tm-main");
  const editor = page.locator(".tm-editor");
  const [mainBox, editorBox] = await Promise.all([main.boundingBox(), editor.boundingBox()]);
  expect(editorBox!.width).toBeGreaterThanOrEqual(mainBox!.width - 70);
  // کنترل‌های بالا و statusbar بخشی از فضای کاری‌اند؛ خودِ سطحِ سند باید
  // تمامِ ارتفاعِ باقی‌مانده را پر کند و زیر محتوا جمع نشود.
  expect(editorBox!.height).toBeGreaterThanOrEqual(mainBox!.height - 80);

  await page.getByRole("button", { name: "حالتِ سورس" }).click();
  const source = page.locator(".tm-source");
  await expect(source).toHaveAttribute("aria-label", "متنِ خامِ مارک‌داون");
  await expect(page.locator(".tm-root")).toHaveAttribute("data-mode", "source");
  await expect(source).toHaveAttribute("dir", "rtl");
  const sourceBox = await source.boundingBox();
  const statsBox = await page.locator(".tm-stats").boundingBox();
  expect(sourceBox!.width).toBeGreaterThanOrEqual(mainBox!.width - 70);
  // سورس باید دقیقاً فضای واقعی میان کنترل‌های بالا و نوار وضعیت را پر کند؛
  // ارتفاع ثابت به فونت و ترجمهٔ دکمه‌ها وابسته بود و با تغییر تایپوگرافی
  // نتیجهٔ درست را اشتباه قرمز می‌کرد.
  expect(sourceBox!.height).toBeGreaterThanOrEqual(statsBox!.y - sourceBox!.y - 1);
  await expect(page.locator(".tm-editor-wrap")).toBeHidden();

  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "انگلیسی" }).click();
  await expect(source).toHaveAttribute("dir", "ltr");
  await expect(source).toHaveAttribute("aria-label", "Raw Markdown");
});
