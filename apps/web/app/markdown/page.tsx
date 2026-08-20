"use client";

import { useState } from "react";
import { MarkdownEditor, type MarkRegistry, BUILTIN_MARKS } from "@tamin/markdown";
import "@tamin/markdown/styles.css";

/**
 * صفحهٔ نمایشیِ `@tamin/markdown`.
 *
 * هدف: دیدنِ رفتارِ واقعی در مرورگر. تستِ jsdom خیلی چیزها را ثابت می‌کند
 * ولی چیدمان و پرشِ متن و رفتارِ RTL را فقط با چشم می‌شود دید.
 */

const SANAD = `---
شناسه: "62285360"
عنوان: بخشنامه نحوه ارزیابی
---

# فصل اول: کلیات {#fasl-1}

این بخشنامه در اجرای :ref[ماده ۵۰ قانون تأمین اجتماعی]{هدف=قانون-تامین#ماده-50} ابلاغ می‌شود. متنِ **پررنگ** و *کج* و \`کدِ درون‌خطی\` هم اینجاست.

:::نکته{نویسنده="دفترِ فنی"}
این بند در بازبینی ۱۴۰۴ اضافه شد. مکان‌نما را داخلِ هر بلوکی ببرید تا نشانه‌های مارک‌داون پیدا شوند.
:::

# فصل دوم: نحوه محاسبه {#fasl-2}

::::ماده{شماره=۳۸ وضعیت=معتبر تاریخ=۱۳۵۵/۱۰/۲۵}
کارفرما مکلف است **حق بیمه** را در مهلتِ مقرر پرداخت کند.

:::تبصره{شماره=۱}
در صورت تأخیر، جریمه تعلق می‌گیرد.
:::

:::تبصره{شماره=۲}
موارد استثنا در آیین‌نامه می‌آید.
:::
::::

::::ماده{شماره=۳۹ وضعیت=منسوخ}
این ماده با بخشنامه بعدی جایگزین شد.
::::

:::هشدار
مهلتِ اعتراض ۳۰ روز است.
:::

:::یک‌مارکِ‌کاملاً‌ناشناخته{الف=ب}
این مارک تعریف ندارد — باید خام نمایش داده شود، نه خطا و نه حذف.
:::

## فهرست‌ها

- یک
- دو
  - تودرتو

1. اول
2. دوم

* [ ] انجام‌نشده
* [x] انجام‌شده

> نقلِ قول

\`\`\`ts
const x: number = 1; // بلوکِ کد همیشه LTR است
\`\`\`

## امنیت

لینکِ [ظاهراً بی‌خطر](javascript:alert(1)) که باید مسدود شود، و
[لینکِ سالم](https://example.com).

<script>window.__XSS__ = true;</script>

<img src="x" onerror="window.__XSS2__ = true">

## جدول

| ماده | وضعیت | تاریخ |
| :- | :-: | -: |
| ۳۸ | معتبر | ۱۳۵۵/۱۰/۲۵ |
| ۳۹ | منسوخ | ۱۳۶۰/۰۲/۱۱ |

## ریاضی

فرمولِ درون‌خطی $E = mc^2$ در متن.

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

## نمودار

\`\`\`mermaid
graph TD;
  A[شروع] --> B[پردازش];
  B --> C[پایان];
\`\`\`
`;

/** یک مارکِ سفارشیِ اضافی — مثالِ چیزی که کاربر از UI می‌سازد. */
const MARKS: MarkRegistry = {
  ...BUILTIN_MARKS,
  تعریف: {
    name: "تعریف",
    label: "تعریفِ اصطلاح",
    kind: "بلوکی",
    color: "#059669",
    icon: "📘",
    variant: "کادر",
    collapsible: true,
    defaultOpen: true,
    counter: true,
    inputRule: true,
    attrs: [{ name: "واژه", label: "واژه", type: "متن" }],
  },
};

export default function MarkdownDemoPage() {
  const [markdown, setMarkdown] = useState(SANAD);
  const [showSource, setShowSource] = useState(false);

  return (
    <main className="p-6" dir="rtl">
      <header className="mb-4">
        <h1 className="text-xl font-bold">@tamin/markdown</h1>
        <p className="text-sm text-neutral-500">
          مکان‌نما را داخلِ هر بلوک ببرید تا نشانه‌ها پیدا شوند. مثلث‌های پنلِ
          کناری و کارت‌ها تا می‌شوند.
        </p>
        <button
          type="button"
          className="mt-2 rounded border px-3 py-1 text-sm"
          onClick={() => setShowSource((v) => !v)}
        >
          {showSource ? "پنهان‌کردنِ خروجی" : "نمایشِ خروجیِ مارک‌داون"}
        </button>
      </header>

      <MarkdownEditor
        defaultValue={SANAD}
        onChange={setMarkdown}
        directives={MARKS}
        outline
        dir="rtl"
        placeholder="بنویسید…"
      />

      {showSource ? (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">
            خروجیِ زندهٔ `serialize` — باید با ورودی یکی باشد تا وقتی چیزی
            تغییر نکرده
          </h2>
          <pre
            dir="ltr"
            className="overflow-x-auto rounded border bg-neutral-50 p-3 text-xs dark:bg-neutral-900"
          >
            {markdown}
          </pre>
          <p className="mt-2 text-xs text-neutral-500">
            بی‌تغییر نسبت به ورودی: {markdown === SANAD ? "✅ بله" : "✏️ ویرایش شده"}
          </p>
        </section>
      ) : null}
    </main>
  );
}
