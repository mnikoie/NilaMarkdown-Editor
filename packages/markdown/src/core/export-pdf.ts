import type { Node as PMNode } from "prosemirror-model";
import { exportHtml, type ExportHtmlOptions } from "./export-html.js";

/**
 * خروجیِ PDF.
 *
 * ★ **از موتورِ چاپِ خودِ مرورگر استفاده می‌شود، نه کتابخانهٔ PDF.**
 *
 * این تصمیمِ اصلیِ این فایل است. گزینهٔ دیگر `jsPDF` یا `pdf-lib` بود.
 * سه دلیل که رد شدند:
 *
 * ۱. **فارسی.** کتابخانه‌های PDF باید فونت را جاسازی کنند و شکل‌دهیِ
 *    حروفِ فارسی و راست‌به‌چپ را خودشان انجام دهند. هیچ‌کدام این را
 *    درست انجام نمی‌دهند — متن یا برعکس درمی‌آید یا حروف جدا می‌مانند.
 *    موتورِ چاپِ مرورگر همان موتوری است که صفحه را رندر کرده، پس
 *    فارسی دقیقاً همان‌طور درمی‌آید که روی صفحه دیده می‌شود.
 *
 * ۲. **حجم.** چند صد کیلوبایت به باندل اضافه می‌شد، برای کاری که
 *    مرورگر رایگان انجام می‌دهد.
 *
 * ۳. **یک منبعِ حقیقت.** چاپ از همان HTMLِ `exportHtml` می‌آید، پس
 *    خروجیِ PDF و خروجیِ HTML هرگز از هم واگرا نمی‌شوند. با کتابخانهٔ
 *    جدا، دو مسیرِ رندر داشتیم که باید هر دو را جدا نگه می‌داشتیم.
 *
 * هزینه‌اش این است که کاربر پنجرهٔ چاپِ مرورگر را می‌بیند و باید
 * «ذخیره به PDF» را انتخاب کند. این را با `@page` و CSSِ چاپ تا حدِ
 * ممکن آماده کرده‌ایم.
 */

export interface ExportPdfOptions extends ExportHtmlOptions {
  /** اندازهٔ کاغذ. پیش‌فرض `A4`. */
  pageSize?: "A4" | "Letter" | "A5";
  /** حاشیه‌ها، با واحدِ CSS. پیش‌فرض `2cm 1.8cm`. */
  margin?: string;
  /** شمارهٔ صفحه در پاورقی. پیش‌فرض `true`. */
  pageNumbers?: boolean;
}

/**
 * CSSِ مخصوصِ چاپ.
 *
 * ★ `@page` تنها جایی است که اندازهٔ کاغذ و حاشیه تعیین می‌شود؛ داخلِ
 * `body` کار نمی‌کند.
 */
function printCss(options: ExportPdfOptions): string {
  const { pageSize = "A4", margin = "2cm 1.8cm", pageNumbers = true } = options;
  const dir = options.dir ?? "rtl";

  return `
@page {
  size: ${pageSize};
  margin: ${margin};
}

@media print {
  /* ★ رنگِ پس‌زمینهٔ کارت‌ها باید در چاپ هم بیاید — وگرنه «ماده» و
     «تبصره» از هم قابلِ تشخیص نیستند. */
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  body { max-width: none; margin: 0; padding: 0; }

  /* ★ سرفصل نباید تهِ صفحه تنها بماند. */
  h1, h2, h3, h4, h5, h6 { break-after: avoid; break-inside: avoid; }
  h1 { break-before: page; }
  h1:first-of-type { break-before: auto; }

  /* ★ این‌ها نباید وسطشان صفحه عوض شود. */
  .tm-mark, pre, table, figure, .tm-fn-def { break-inside: avoid; }

  /* ★ یک خطِ تنها در بالا یا پایینِ صفحه زشت است. */
  p, li { orphans: 3; widows: 3; }

  /* فهرستِ مطالب صفحهٔ خودش را دارد. */
  .tm-toc { break-after: page; }

  /* چیزهایی که فقط روی صفحه معنی دارند. */
  .tm-print-hide, .tm-code-copy { display: none !important; }
}
${
  pageNumbers
    ? `
@page {
  @bottom-center {
    content: counter(page);
    font-family: Vazirmatn, system-ui, sans-serif;
    font-size: 9pt;
    color: #666;
  }
}
`
    : ""
}
:root { direction: ${dir}; }
`.trim();
}

/**
 * HTMLِ آمادهٔ چاپ — همان `exportHtml` به‌علاوهٔ CSSِ چاپ.
 *
 * جدا از `exportPdf` است تا بشود تستش کرد و بی مرورگر هم ساختش.
 */
export function buildPrintHtml(doc: PMNode, options: ExportPdfOptions = {}): string {
  // ★ `standalone` اجباری است: صفحهٔ چاپ باید `<head>` و `<style>` کامل
  // داشته باشد.
  const html = exportHtml(doc, { ...options, standalone: true });
  const extra = printCss(options);

  // CSSِ چاپ **بعد از** CSSِ اصلی می‌آید تا بتواند رویش را بگیرد.
  return html.replace("</style>", `\n${extra}\n</style>`);
}

export interface PrintResult {
  ok: boolean;
  /** اگر شکست خورد، چرا — برای نشان‌دادن به کاربر. */
  reason?: string;
}

/**
 * پنجرهٔ چاپ را با محتوای سند باز می‌کند.
 *
 * ★ **`iframe`ِ پنهان، نه `window.open`.**
 *
 * پنجرهٔ تازه را بلاک‌کنندهٔ پاپ‌آپ می‌بندد — و کاربری که دکمهٔ «خروجیِ
 * PDF» را زده هیچ بازخوردی نمی‌گیرد. `iframe` هرگز بلاک نمی‌شود.
 *
 * ★ **`srcdoc` و نه `document.write`.** دومی در مرورگرهای تازه منسوخ
 * است و گاهی سندِ نیمه‌بارشده می‌دهد.
 */
export function exportPdf(doc: PMNode, options: ExportPdfOptions = {}): Promise<PrintResult> {
  if (typeof document === "undefined") {
    return Promise.resolve({ ok: false, reason: "بیرونِ مرورگر" });
  }

  const html = buildPrintHtml(doc, options);

  return new Promise<PrintResult>((resolve) => {
    const frame = document.createElement("iframe");
    // از دید پنهان، ولی **نه `display: none`** — بعضی مرورگرها سندِ
    // نمایش‌داده‌نشده را چاپ نمی‌کنند.
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText =
      "position:fixed;inset:auto auto 0 0;width:1px;height:1px;opacity:0;border:0;pointer-events:none;";
    frame.srcdoc = html;

    let settled = false;
    const finish = (result: PrintResult) => {
      if (settled) return;
      settled = true;
      // ★ حذفِ فوریِ frame پنجرهٔ چاپ را در بعضی مرورگرها می‌بندد.
      // یک تأخیرِ کوتاه کافی است.
      setTimeout(() => frame.remove(), 1000);
      resolve(result);
    };

    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        finish({ ok: false, reason: "ساختنِ صفحهٔ چاپ شکست خورد" });
        return;
      }
      try {
        win.focus();
        win.print();
        finish({ ok: true });
      } catch {
        finish({ ok: false, reason: "مرورگر اجازهٔ چاپ نداد" });
      }
    };

    // اگر `onload` هرگز نیامد، بی‌جواب نمان.
    setTimeout(() => finish({ ok: false, reason: "صفحهٔ چاپ آماده نشد" }), 10_000);

    document.body.append(frame);
  });
}
