import { test, expect } from "@playwright/test";

/**
 * تستِ سرتاسری — رفتارِ واقعی در Chromium.
 *
 * چیزهایی که فقط اینجا دیده می‌شوند: KaTeX (در jsdom بار نمی‌شود)،
 * چیدمانِ RTL، و اینکه صفحه واقعاً پاسخ‌گو می‌ماند.
 */

/**
 * مکان‌نما را در انتهای یک پاراگرافِ عادی می‌گذارد.
 *
 * ناوبری با کلید (`End`، `Control+End`) در سندی که front-matter و
 * بلوکِ کد دارد، جاهای غیرمنتظره می‌افتد. این تابع مستقیم روی گرهٔ
 * متنیِ مشخص می‌نشیند.
 */
async function placeCursorInParagraph(page: import("@playwright/test").Page, contains: string) {
  await page.evaluate((needle) => {
    const p = [...document.querySelectorAll(".tm-editor p")].find((e) =>
      e.textContent?.includes(needle),
    );
    if (!p?.firstChild) throw new Error("پاراگراف پیدا نشد: " + needle);
    const range = document.createRange();
    range.selectNodeContents(p);
    range.collapse(false);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    (document.querySelector(".tm-editor") as HTMLElement).focus();
  }, contains);
  // یک خطِ نو بساز تا `/` در ابتدای بلوک باشد
  await page.keyboard.press("Enter");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/markdown?fixture=demo");
  await page.waitForSelector(".tm-editor", { timeout: 25000 });
  const viewMenu = page.getByRole("button", { name: "نمایش", exact: true });
  await viewMenu.click();
  const unfoldAll = page.getByRole("menuitem", { name: "بازکردن همهٔ بخش‌ها" });
  if (await unfoldAll.count()) await unfoldAll.click();
  else await viewMenu.click();
});

test("صفحه بی خطا بار می‌شود و ساختار درست است", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await expect(page.locator(".tm-mark")).toHaveCount(7);
  await expect(page.locator('[data-status="منسوخ"]')).toHaveCount(1);
  await expect(page.locator('[data-unknown="true"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("★ View هیچ نشانهٔ خام Markdown نشان نمی‌دهد", async ({ page }) => {
  await expect(page.locator(".tm-marker")).toHaveCount(0);

  await page.locator(".tm-editor p", { hasText: "پررنگ" }).first().click();
  await expect(page.locator(".tm-marker")).toHaveCount(0);
  const text = await page.locator(".tm-editor").innerText();
  expect(text).toContain("پررنگ");
  expect(text).not.toContain("**");
});

test("★ Source همهٔ علائم Markdown را نگه می‌دارد و View آن‌ها را رندر می‌کند", async ({ page }) => {
  const markdown = "## عنوان **پررنگ**\n\n- مورد\n\n> نقل قول\n\n`کد` [پیوند](https://example.com)";
  await page.getByRole("button", { name: "حالتِ سورس (Ctrl+/)" }).click();
  const source = page.locator(".tm-source");
  await source.fill(markdown);
  await expect(source).toHaveValue(markdown);

  await page.getByRole("button", { name: "حالتِ ویرایش (Ctrl+/)" }).click();
  await expect(page.locator(".tm-editor h2")).toContainText("عنوان پررنگ");
  await expect(page.locator(".tm-editor strong")).toHaveText("پررنگ");
  await expect(page.locator(".tm-editor blockquote")).toContainText("نقل قول");
  await expect(page.locator(".tm-editor code")).toContainText("کد");
  await expect(page.locator(".tm-editor a")).toHaveAttribute("href", "https://example.com");
  await expect(page.locator(".tm-marker")).toHaveCount(0);
});

test("★ منوهای قالب، پاراگراف و سریع در Source Markdown خام می‌نویسند", async ({ page }) => {
  const source = page.locator(".tm-source");
  await page.getByRole("button", { name: "حالتِ سورس (Ctrl+/)" }).click();
  await source.fill("**متن**");
  await source.click();
  await page.keyboard.press("Control+A");
  const bold = page.getByRole("button", { name: "پررنگ (Ctrl+B)" });
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await bold.click();
  await expect(source).toHaveValue("متن");

  await source.fill("متن");
  await source.selectText();

  const format = page.getByRole("button", { name: "قالب", exact: true });
  const paragraph = page.getByRole("button", { name: "پاراگراف", exact: true });
  await expect(format).toBeEnabled();
  await expect(paragraph).toBeEnabled();

  await format.click();
  await page.getByRole("menuitemcheckbox", { name: /پررنگ/ }).click();
  await expect(source).toHaveValue("**متن**");

  await source.selectText();
  await paragraph.click();
  await page.getByRole("menuitem", { name: /عنوان 2/ }).click();
  await expect(source).toHaveValue("## **متن**");

  await source.selectText();
  await page.getByRole("button", { name: "فهرستِ نقطه‌ای (Ctrl+Shift+8)" }).click();
  await expect(source).toHaveValue("- ## **متن**");
});

test("★ KaTeX در مرورگرِ واقعی رندر می‌شود", async ({ page }) => {
  await expect(page.locator(".tm-math-block")).toHaveAttribute("data-rendered", "true");
  await expect(page.locator(".katex").first()).toBeVisible();
});

test("★ کد بی‌رنگ هم خوانا و قابلِ کپی است", async ({ page }) => {
  // ★ زبانی که رنگ‌آمیز نمی‌شناسدش — همان حالتی که قبلاً پیش‌فرضِ همهٔ
  // بلوک‌ها بود و حالا فقط برای زبانِ ناشناخته می‌ماند.
  //
  // (رنگ‌آمیزی از وقتی به Web Worker رفت پیش‌فرض **روشن** است؛ تستش در
  // `highlight-worker.spec.ts` است.)
  const code = page.locator('.tm-code[data-language="brainfuck"]');
  await expect(code).toHaveAttribute("data-highlighted", "false", { timeout: 30000 });
  await expect(code.locator("> pre > code")).toContainText("++++++++[");
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
  await expect(page.locator(".tm-fold-summary")).toHaveCount(0);
});

test("★ تایپ کار می‌کند و خروجی به‌روز می‌شود", async ({ page }) => {
  const p = page.locator(".tm-editor p", { hasText: "جریمه" }).first();
  await p.click();
  await page.keyboard.type("آزمایش");
  await page.waitForTimeout(600); // debounce ۳۰۰ms
  await expect(page.getByTestId("markdown-output")).toContainText("آزمایش");
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

test("★★ XSS: هیچ اسکریپتی اجرا نمی‌شود", async ({ page }) => {
  // سند حاوی <script> و onerror است — هیچ‌کدام نباید اجرا شوند.
  const xss = await page.evaluate(() => ({
    script: (window as unknown as Record<string, unknown>).__XSS__ ?? null,
    onerror: (window as unknown as Record<string, unknown>).__XSS2__ ?? null,
  }));
  expect(xss).toEqual({ script: null, onerror: null });

  // لینکِ javascript: مسدود شده
  const bad = page.locator('.tm-editor a', { hasText: "ظاهراً بی‌خطر" });
  await expect(bad).toHaveAttribute("href", "#blocked");

  // لینکِ سالم دست‌نخورده
  const good = page.locator('.tm-editor a', { hasText: "لینکِ سالم" });
  await expect(good).toHaveAttribute("href", "https://example.com");

  // HTMLِ خام به‌صورتِ متن نشان داده شده، نه رندرشده
  await expect(page.locator(".tm-html-source").first()).toContainText("script");
});

test("★ نوارِ ابزار — کلیک و دسترس‌پذیری", async ({ page }) => {
  const toolbar = page.locator('[role="toolbar"]');
  await expect(toolbar).toBeVisible();

  // ★ کلِ نوار یک توقفِ Tab است — نه یکی به‌ازای هر دکمه
  const tabbable = toolbar.locator('button[tabindex="0"]');
  await expect(tabbable).toHaveCount(1);

  // انتخابِ متن و پررنگ‌کردن.
  // انتخاب با کلیدِ جهت در RTL قابلِ اتکا نیست (Home و ArrowRight
  // بسته به جهت رفتارِ متفاوت دارند)، پس با دابل‌کلیک یک کلمه را
  // انتخاب می‌کنیم — همان کاری که کاربر می‌کند.
  const p = page.locator(".tm-editor p", { hasText: "جریمه" }).first();
  await p.click();

  // انتخاب را با Selection API روی متنِ واقعی می‌گذاریم. کلیدهای جهت در
  // RTL قابلِ اتکا نیستند و dblclick هم روی متنِ فارسی همیشه کلمه را
  // نمی‌گیرد.
  await page.evaluate(() => {
    const el = [...document.querySelectorAll(".tm-editor p")].find((e) =>
      e.textContent?.includes("جریمه"),
    )!;
    const textNode = el.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await expect
    .poll(async () => page.evaluate(() => window.getSelection()?.toString().trim().length ?? 0))
    .toBeGreaterThan(0);

  await toolbar.getByRole("button", { name: /پررنگ/ }).click();
  await expect(p.locator("strong")).toHaveCount(1);
});

test("★ نوارِ آمار، کلمه‌ها را می‌شمارد", async ({ page }) => {
  const stats = page.locator(".tm-stats");
  await expect(stats).toContainText("کلمه");
  await expect(stats).toContainText("دقیقه خواندن");
  await expect(stats.locator("span").last()).toHaveAttribute("title", /÷ ۲۵۰/);
});

test("★ جست‌وجو با Ctrl+F", async ({ page }) => {
  await page.locator(".tm-editor p").first().click();
  await page.keyboard.press("Control+f");

  const panel = page.locator('[role="search"]');
  await expect(panel).toBeVisible();

  await panel.locator(".tm-search-input").first().fill("ماده");
  await expect(page.locator(".tm-search-match").first()).toBeAttached();

  const count = await page.locator(".tm-search-match").count();
  expect(count).toBeGreaterThan(1);
  await expect(page.locator(".tm-search-active")).toHaveCount(1);
  await expect(panel.locator(".tm-search-count")).toContainText("از");

  // بعدی
  await panel.getByRole("button", { name: "بعدی" }).click();
  await expect(page.locator(".tm-search-active")).toHaveCount(1);

  // Escape می‌بندد و همه‌چیز پاک می‌شود
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page.locator(".tm-search-match")).toHaveCount(0);
});

test("★★ جست‌وجو به نتیجهٔ اول و سپس نتیجهٔ بعدی می‌پرد", async ({ page }) => {
  const filler = Array.from({ length: 45 }, (_, index) => `پاراگراف پرکننده ${index + 1}`).join("\n\n");
  const markdown = `# آغاز\n\n${filler}\n\nنشانه نخست\n\n${filler}\n\nنشانه دوم\n`;

  await page.getByRole("button", { name: "حالتِ سورس (Ctrl+/)" }).click();
  await page.locator(".tm-source").fill(markdown);
  await page.getByRole("button", { name: "حالتِ ویرایش (Ctrl+/)" }).click();
  await page.locator(".tm-editor p").first().click();
  await page.keyboard.press("Control+f");

  const panel = page.getByRole("search");
  await panel.getByRole("textbox", { name: "عبارتِ جست‌وجو" }).fill("نشانه");

  const first = page.locator(".tm-editor p", { hasText: "نشانه نخست" }).locator(".tm-search-active");
  await expect(first).toBeAttached();
  await expect(first).toBeInViewport();

  await panel.getByRole("button", { name: "بعدی" }).click();
  const second = page.locator(".tm-editor p", { hasText: "نشانه دوم" }).locator(".tm-search-active");
  await expect(second).toBeAttached();
  await expect(second).toBeInViewport();
  await expect(panel.locator(".tm-search-count")).toContainText("۲ از ۲");
});

test("★★ جست‌وجو در حالت سورس هم انتخاب و اسکرول می‌کند", async ({ page }) => {
  const filler = Array.from({ length: 70 }, (_, index) => `سطر پرکنندهٔ بلند ${index + 1} برای آزمون اسکرول`).join("\n\n");
  const markdown = `# آغاز\n\n${filler}\n\nنشانه نخست\n\n${filler}\n\nنشانه دوم\n`;

  await page.getByRole("button", { name: "حالتِ سورس (Ctrl+/)" }).click();
  const source = page.locator(".tm-source");
  await source.fill(markdown);
  await source.press("Control+f");

  const panel = page.getByRole("search");
  await panel.getByRole("textbox", { name: "عبارتِ جست‌وجو" }).fill("نشانه");
  await expect.poll(() => source.evaluate((element: HTMLTextAreaElement) => element.selectionStart))
    .toBe(markdown.indexOf("نشانه"));
  await expect.poll(() => source.evaluate((element: HTMLTextAreaElement) => element.scrollTop))
    .toBeGreaterThan(0);

  await panel.getByRole("button", { name: "بعدی" }).click();
  await expect.poll(() => source.evaluate((element: HTMLTextAreaElement) => element.selectionStart))
    .toBe(markdown.lastIndexOf("نشانه"));
  await expect(panel.locator(".tm-search-count")).toContainText("۲ از ۲");
});

test("★ جست‌وجو، املای عربی/فارسی را یکی می‌بیند", async ({ page }) => {
  await page.locator(".tm-editor p").first().click();
  await page.keyboard.press("Control+f");
  const panel = page.locator('[role="search"]');

  // «تأمین» در سند هست؛ با «تامین» (بی همزه) هم باید پیدا شود
  await panel.locator(".tm-search-input").first().fill("تامین");
  await expect(page.locator(".tm-search-match").first()).toBeAttached();
  await page.keyboard.press("Escape");
});

test("★ جایگزینیِ همه با Ctrl+H — یک قدمِ undo", async ({ page }) => {
  await page.locator(".tm-editor p").first().click();
  await page.keyboard.press("Control+h");
  const panel = page.locator('[role="search"]');
  await expect(panel).toBeVisible();

  await panel.locator(".tm-search-input").first().fill("جریمه");
  await expect(page.locator(".tm-search-match").first()).toBeAttached();

  await panel.locator(".tm-search-input").nth(1).fill("خسارت");
  await panel.getByRole("button", { name: /همه/ }).click();

  await expect(page.locator(".tm-editor")).toContainText("خسارت");

  // یک Ctrl+Z همه را برمی‌گرداند
  await page.keyboard.press("Escape");
  await page.locator(".tm-editor p").first().click();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".tm-editor")).toContainText("جریمه");
});

test("★ منوی / — درجِ بلوک", async ({ page }) => {
  // ⚠️ ناوبری با کلید در این سند قابلِ اتکا نیست: `Control+End` داخلِ
  // بلوکِ mermaid می‌افتد و `End`+`Enter` داخلِ front-matter — هر دو
  // جاهایی که منو عمداً کار نمی‌کند. پس مکان‌نما را صریح در یک
  // پاراگرافِ عادی می‌گذاریم.
  await placeCursorInParagraph(page, "جریمه");

  await page.keyboard.type("/");
  const menu = page.locator('[role="listbox"]');
  await expect(menu).toBeVisible();

  // ★ مارک‌های سفارشی هم در منو هستند
  await expect(menu).toContainText("نکتهٔ نویسنده");
  await expect(menu).toContainText("جدول");

  // فیلتر با تایپ.
  // منو با رویدادهای DOM دوباره رندر می‌شود، پس تا وقتی گزینهٔ فعال
  // واقعاً «جدول» نشده، Enter را نمی‌زنیم — وگرنه آیتمِ دیگری درج
  // می‌شود و تست به‌شکلِ نامنظم می‌افتد.
  await page.keyboard.type("جدول");
  await expect(menu.locator('[role="option"]')).toHaveCount(1);
  await expect(menu.locator('[aria-selected="true"]')).toContainText("جدول");

  // Enter درج می‌کند — نتیجهٔ سند اول بررسی می‌شود، بعد بسته‌شدنِ منو.
  // (منو کامپوننتِ React است و unmountش یک تیک عقب‌تر از تراکنشِ
  // ProseMirror اتفاق می‌افتد.)
  const tablesBefore = await page.locator(".tm-editor table").count();
  await page.keyboard.press("Enter");

  await expect(page.locator(".tm-editor table")).toHaveCount(tablesBefore + 1);
  await expect(page.locator(".tm-editor")).not.toContainText("/جدول");
  await expect(menu).toBeHidden();
});

test("★ منوی / با Escape بسته می‌شود و متن می‌ماند", async ({ page }) => {
  await placeCursorInParagraph(page, "جریمه");
  await page.keyboard.type("/عنوان");

  await expect(page.locator('[role="listbox"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[role="listbox"]')).toBeHidden();
  // متن دست‌نخورده می‌ماند — کاربر شاید واقعاً می‌خواست `/عنوان` بنویسد
  await expect(page.locator(".tm-editor")).toContainText("/عنوان");
});

test("★ فوت‌نوت رندر می‌شود", async ({ page }) => {
  // ارجاع در متن
  const refs = page.locator(".tm-footnote-ref");
  await expect(refs).toHaveCount(2);
  await expect(refs.first()).toHaveAttribute("data-identifier", "۱");

  // تعریف‌ها ته سند
  const defs = page.locator(".tm-footnote-def");
  await expect(defs).toHaveCount(2);
  await expect(defs.first()).toContainText("۶۲۲۸۵۳۶۰");

  // شناسهٔ متنیِ فارسی هم کار می‌کند
  await expect(page.locator('[data-identifier="منبع"]').first()).toBeAttached();
});

test("★ حالتِ تمرکز — بقیهٔ بلوک‌ها کم‌رنگ می‌شوند", async ({ page }) => {
  await expect(page.locator(".tm-dimmed")).toHaveCount(0);

  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: /حالت تمرکز/ }).click();
  await page.locator(".tm-editor p", { hasText: "جریمه" }).first().click();

  // بلوک‌های دیگر کم‌رنگ‌اند، بلوکِ فعال نه
  expect(await page.locator(".tm-dimmed").count()).toBeGreaterThan(0);
  await expect(page.locator(".tm-editor")).toHaveClass(/tm-focus-mode/);

  // خروج
  await page.getByRole("button", { name: "نمایش", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: /حالت تمرکز/ }).click();
  await expect(page.locator(".tm-dimmed")).toHaveCount(0);
});
