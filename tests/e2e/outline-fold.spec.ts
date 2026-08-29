import { expect, test } from "@playwright/test";

/**
 * رفتارِ جاریِ ساختار سند.
 *
 * در اپ NilaMarkdown کنترل‌های تاشدنِ داخل متن عمداً خاموش‌اند تا سطح
 * خواندن خلوت بماند. جمع‌کردن شاخه‌های پنل فقط نمایشِ درخت را تغییر می‌دهد؛
 * قابلیت folding خودِ کامپوننت همچنان به‌صورت opt-in آزموده می‌شود.
 */
test.beforeEach(async ({ page }) => {
  await page.goto("/markdown?fixture=demo");
  await page.waitForSelector(".tm-editor", { timeout: 25_000 });
});

test("فصل‌های هم‌سطح در پنل ساختار هم‌ترازند", async ({ page }) => {
  const item = (id: string) => page.locator(`[data-outline-id="${id}"]`);
  await expect(item("fasl-1")).toHaveAttribute("aria-level", "1");
  await expect(item("fasl-2")).toHaveAttribute("aria-level", "1");
  const [first, second] = await Promise.all([
    item("fasl-1").locator(".tm-outline-title").evaluate((element) => Math.round(element.getBoundingClientRect().right)),
    item("fasl-2").locator(".tm-outline-title").evaluate((element) => Math.round(element.getBoundingClientRect().right)),
  ]);
  expect(Math.abs(first - second)).toBeLessThanOrEqual(1);
});

test("کنترل شاخه و جای‌خالی گره‌های هم‌سطح هم‌اندازه‌اند", async ({ page }) => {
  const controls = page.locator('.tm-outline [aria-level="1"] > :is(.tm-fold-toggle, .tm-fold-spacer)');
  await expect(controls).toHaveCount(2);
  const widths = await controls.evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().width)),
  );
  expect(new Set(widths).size).toBe(1);
});

test("اپ پیش‌فرض هیچ آیکون تاشدنی داخل متن نشان نمی‌دهد", async ({ page }) => {
  await expect(page.locator(".tm-root")).toHaveAttribute("data-folding", "disabled");
  await expect(page.locator(".tm-inline-fold, .tm-list-fold-toggle, .tm-mark-header > .tm-fold-toggle")).toHaveCount(0);
  await expect(page.locator(".tm-folded-hidden")).toHaveCount(0);
  await expect(page.locator(".tm-editor h1")).toHaveCount(2);
});

test("بستن شاخهٔ Outline متن سند را پنهان نمی‌کند", async ({ page }) => {
  const toggle = page.locator(".tm-outline .tm-fold-toggle").first();
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const before = await page.locator(".tm-outline-item:visible").count();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(await page.locator(".tm-outline-item:visible").count()).toBeLessThan(before);
  await expect(page.locator(".tm-editor h2", { hasText: "امنیت" })).toBeVisible();
  await expect(page.locator(".tm-folded-hidden")).toHaveCount(0);
});

test("کلیک Outline آغاز آیتم را زیر نوار ابزار می‌آورد", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "جست‌وجو در ساختار" });
  await search.fill("۲. دوم");
  const outlineItem = page.getByRole("treeitem", { name: "۲. دوم", exact: true });
  await outlineItem.click();

  const target = page.locator(".tm-editor ol > li").filter({ hasText: "دوم" }).first();
  const controls = page.locator(".tm-main > .tm-editor-controls");
  await expect(target).toBeInViewport();
  await expect(outlineItem).toHaveAttribute("aria-selected", "true");
  const [targetBox, controlsBox] = await Promise.all([target.boundingBox(), controls.boundingBox()]);
  expect(targetBox!.y).toBeGreaterThanOrEqual(controlsBox!.y + controlsBox!.height + 6);
  expect(targetBox!.y).toBeLessThanOrEqual(controlsBox!.y + controlsBox!.height + 28);
});

test("کلیک Outline در Source خط مقصد را بالای سطح نشان می‌دهد", async ({ page }) => {
  await page.getByRole("button", { name: "حالتِ سورس" }).click();
  await page.getByRole("searchbox", { name: "جست‌وجو در ساختار" }).fill("۲. دوم");
  await page.getByRole("treeitem", { name: "۲. دوم", exact: true }).click();

  const source = page.locator(".tm-source");
  const state = await source.evaluate((element: HTMLTextAreaElement) => ({
    selected: element.value.slice(element.selectionStart, element.selectionEnd),
    scrollTop: element.scrollTop,
  }));
  expect(state.selected).toContain("2. دوم");
  expect(state.scrollTop).toBeGreaterThan(0);
});

test("پنل ساختار بسته و دوباره باز می‌شود", async ({ page }) => {
  await page.getByRole("button", { name: "بستن پنل ساختار" }).click();
  await expect(page.getByRole("complementary", { name: "پنلِ ساختار" })).toHaveCount(0);
  await expect(page.getByRole("separator", { name: "تغییر عرض پنل ساختار" })).toHaveCount(0);
  await page.getByRole("button", { name: "بازکردن پنل ساختار" }).click();
  await expect(page.getByRole("complementary", { name: "پنلِ ساختار" })).toBeVisible();
});

test("عرض پنل با ماوس و کیبورد تغییر می‌کند", async ({ page }) => {
  const sidebar = page.locator(".tm-sidebar");
  const resizer = page.getByRole("separator", { name: "تغییر عرض پنل ساختار" });
  const before = (await sidebar.boundingBox())!.width;
  const handle = (await resizer.boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 100);
  await page.mouse.down();
  await page.mouse.move(handle.x - 80, handle.y + 100);
  await page.mouse.up();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThan(before + 60);
  const afterMouse = (await sidebar.boundingBox())!.width;
  await resizer.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(afterMouse);
});

test("Source تمام فضای سند را می‌گیرد و Vazirmatn دارد", async ({ page }) => {
  await page.getByRole("button", { name: "حالتِ سورس" }).click();
  const source = page.locator(".tm-source");
  await expect(source).toHaveAttribute("dir", "rtl");
  await expect(source).toHaveCSS("font-family", /Vazirmatn/i);
  await expect(page.locator(".tm-editor-wrap")).toBeHidden();
  const [mainBox, sourceBox, statsBox] = await Promise.all([
    page.locator(".tm-main").boundingBox(),
    source.boundingBox(),
    page.locator(".tm-stats").boundingBox(),
  ]);
  expect(sourceBox!.width).toBeGreaterThanOrEqual(mainBox!.width - 80);
  expect(sourceBox!.height).toBeGreaterThanOrEqual(statsBox!.y - sourceBox!.y - 1);
});

test("folding اختیاریِ کامپوننت همچنان کار می‌کند", async ({ page }) => {
  await page.goto("/markdown?fixture=demo&folding=true");
  await page.waitForSelector(".tm-editor");
  const heading = page.locator(".tm-editor h1").first();
  const toggle = heading.locator(".tm-inline-fold");
  await expect(heading).toHaveAttribute("data-folded", "true");
  await toggle.click();
  await expect(heading).toHaveAttribute("data-folded", "false");
  await toggle.click();
  await expect(heading).toHaveAttribute("data-folded", "true");
});
