import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView, ViewMutationRecord } from "prosemirror-view";
import { highlight as highlightInWorker } from "../core/highlight/client.js";

/**
 * بلوکِ کد با رنگ‌آمیزی و دکمهٔ کپی.
 *
 * ★ قاعدهٔ بندِ ۳: اگر Shiki نصب نباشد، کد **خام نمایش داده می‌شود — نه
 * خطا، نه صفحهٔ سفید**. کسی که فقط متن می‌نویسد نباید چند صد کیلوبایت
 * هزینه بدهد.
 *
 * ★ رنگ‌آمیزی روی لایهٔ نمایش است، نه سند: `contentDOM` همیشه متنِ خامِ
 * قابلِ ویرایش می‌ماند و HTMLِ رنگی زیرش به‌عنوانِ پس‌زمینه می‌نشیند.
 * اگر HTMLِ Shiki را داخلِ `contentDOM` بگذاریم، ProseMirror آن را
 * محتوای سند می‌بیند و با اولین تایپ همه‌چیز خراب می‌شود.
 *
 * ★ **خودِ رنگ‌آمیزی اینجا اجرا نمی‌شود.** به Web Worker سپرده شده
 * (`core/highlight/`). دلیلش اندازه‌گیری‌شده است و در همان‌جا نوشته
 * شده. اینجا فقط درخواست می‌رود و HTMLِ آماده برمی‌گردد.
 */

/**
 * محیط، مرورگرِ واقعی است؟
 *
 * Mermaid به APIهایی نیاز دارد که jsdom و Node ندارند (Canvas، اندازه‌گیریِ
 * متن). بارگذاری‌اش آنجا فقط وقت می‌گیرد و در بهترین حالت شکست می‌خورد —
 * در بدترین حالت پروسه را می‌کُشد.
 *
 * `jsdom` خودش را در userAgent اعلام می‌کند؛ همان علامتِ کافی است.
 */
export function isRealBrowser(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return !ua.includes("jsdom");
}

/**
 * `import()` با نامِ متغیر.
 *
 * ★ چرا این‌طور و نه `import("mermaid")` مستقیم: باندلرها (Vite، webpack)
 * `import()`ِ با رشتهٔ ثابت را **در زمانِ بیلد** پیدا می‌کنند و پکیج را
 * از پیش آماده می‌کنند — حتی اگر در زمانِ اجرا هرگز صدا نشود. برای
 * پکیج‌های چند‌مگابایتی این یعنی تستِ ۱ ثانیه‌ای به ۹۰ ثانیه می‌رسد و
 * گاهی پروسه می‌میرد.
 *
 * جدولِ زیر هر دو مسئله را حل می‌کند: رشته‌ها ثابت‌اند پس باندلر درست کار
 * می‌کند، و چون داخلِ تابع‌های تنبل‌اند، فقط با صداکردن اجرا می‌شوند.
 */
export async function importOptional<T>(name: string): Promise<T | null> {
  try {
    const loader = OPTIONAL_LOADERS[name];
    if (!loader) return null;
    return (await loader()) as T;
  } catch {
    // نصب نیست، یا بارگذاری شکست خورد → `null`، و فراخوان به حالتِ
    // خام برمی‌گردد. سند نباید بشکند.
    return null;
  }
}

const OPTIONAL_LOADERS: Record<string, () => Promise<unknown>> = {
  katex: () => import("katex"),
  mermaid: () => import("mermaid"),
};

export class CodeBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;

  private pre: HTMLPreElement;
  private highlightLayer: HTMLElement;
  private langLabel: HTMLElement;
  private copyButton: HTMLButtonElement;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  /** شمارندهٔ نسخه — پاسخِ کهنهٔ worker را بی‌اثر می‌کند. */
  private highlightToken = 0;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
    /** اگر خاموش باشد، Shiki اصلاً بار نمی‌شود. */
    private highlightEnabled = false,
    private locale: "fa" | "en" = "fa",
  ) {
    this.dom = document.createElement("div");
    this.dom.className = "tm-code";

    const header = document.createElement("div");
    header.className = "tm-code-header";
    header.contentEditable = "false";

    this.langLabel = document.createElement("span");
    this.langLabel.className = "tm-code-lang";

    this.copyButton = document.createElement("button");
    this.copyButton.type = "button";
    this.copyButton.className = "tm-code-copy";
    this.copyButton.textContent = this.locale === "en" ? "Copy" : "کپی";
    this.copyButton.addEventListener("click", (e) => {
      e.preventDefault();
      void this.copy();
    });

    header.append(this.langLabel, this.copyButton);

    this.highlightLayer = document.createElement("div");
    this.highlightLayer.className = "tm-code-highlight";
    this.highlightLayer.setAttribute("aria-hidden", "true");
    this.highlightLayer.contentEditable = "false";

    this.pre = document.createElement("pre");
    const code = document.createElement("code");
    this.pre.append(code);
    this.contentDOM = code;

    this.dom.append(header, this.highlightLayer, this.pre);
    this.render();
  }

  private get language(): string {
    return ((this.node.attrs.language as string) || "").trim();
  }

  /**
   * وعدهٔ آخرین رنگ‌آمیزی — برای تست، تا بشود منتظرش ماند به‌جای
   * `setTimeout`ِ حدسی.
   */
  highlighted: Promise<void> = Promise.resolve();

  private render() {
    const lang = this.language;
    this.langLabel.textContent = lang || (this.locale === "en" ? "Text" : "متن");
    if (this.dom.getAttribute("data-language") !== lang) {
      this.dom.setAttribute("data-language", lang);
    }
    this.highlighted = this.highlight();
  }

  private async highlight() {
    const lang = this.language;
    const code = this.node.textContent;
    // نسخهٔ فعلی — پاسخِ کهنه نباید روی نسخهٔ تازه بنشیند.
    const token = ++this.highlightToken;

    if (!lang || !code) {
      this.clearHighlight(null);
      return;
    }

    if (!this.highlightEnabled) {
      this.clearHighlight("false");
      return;
    }

    // تا وقتی پاسخ نیامده، متن **خوانا و قابلِ ویرایش** است. فقط بی‌رنگ.
    this.setState("pending");

    const result = await highlightInWorker(code, lang);

    // بلوک پاک شد، یا کاربر بینِ درخواست و پاسخ تایپ کرد → دور بریز.
    if (this.destroyed || token !== this.highlightToken) return;

    if (!result) {
      // Shiki نصب نیست، زبان ناشناخته، یا worker در دسترس نیست →
      // کدِ خام. این حالتِ عادی است، نه خطا.
      this.clearHighlight("false");
      return;
    }

    this.highlightLayer.innerHTML = result.html;
    this.setState("true");
  }

  /**
   * صفت را فقط وقتی می‌نویسد که واقعاً عوض شده باشد.
   *
   * نوشتنِ صفتِ تکراری یک جهشِ DOM اضافه است — و هر جهشِ اضافه یک فرصتِ
   * تازه برای همان حلقه‌ای که در `ignoreMutation` توضیح داده شد.
   */
  private setState(state: string | null) {
    const current = this.dom.getAttribute("data-highlighted");
    if (current === state) return;
    if (state === null) this.dom.removeAttribute("data-highlighted");
    else this.dom.setAttribute("data-highlighted", state);
  }

  private clearHighlight(state: string | null) {
    if (this.highlightLayer.firstChild) this.highlightLayer.textContent = "";
    this.setState(state);
  }

  private async copy() {
    const text = this.node.textContent;
    try {
      await navigator.clipboard.writeText(text);
      this.copyButton.textContent = this.locale === "en" ? "Copied ✓" : "کپی شد ✓";
    } catch {
      this.copyButton.textContent = this.locale === "en" ? "Copy failed" : "کپی نشد";
    }
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => {
      this.copyButton.textContent = this.locale === "en" ? "Copy" : "کپی";
    }, 2000);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    const textChanged = node.textContent !== this.node.textContent;
    const langChanged = node.attrs.language !== this.node.attrs.language;
    this.node = node;
    if (textChanged || langChanged) this.render();
    return true;
  }

  stopEvent(event: Event): boolean {
    return this.copyButton.contains(event.target as Node);
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    // لایهٔ رنگ‌آمیزی را خودمان عوض می‌کنیم؛ ProseMirror نباید آن را
    // تغییرِ سند بفهمد.
    if (this.highlightLayer.contains(mutation.target)) return true;

    // ★ صفاتی که خودمان روی ریشه می‌گذاریم (`data-highlighted`،
    // `data-language`) هم تغییرِ سند نیستند.
    //
    // بی این، یک **حلقهٔ بی‌پایان** درست می‌شود و اندازه‌گیری شد: نوشتنِ
    // صفت → ProseMirror آن را جهشِ DOM می‌بیند → NodeView را دوباره
    // می‌سازد → `render()` → درخواستِ رنگ‌آمیزی → پاسخ → نوشتنِ صفت…
    // در مرورگر هزاران درخواست در چند ثانیه شمرده شد و صفحه از پا
    // درآمد.
    if (mutation.type === "attributes" && mutation.target === this.dom) return true;

    // تنها چیزی که واقعاً محتواست، خودِ `contentDOM` است.
    return !this.contentDOM.contains(mutation.target);
  }

  destroy() {
    this.destroyed = true;
    if (this.copyTimer) clearTimeout(this.copyTimer);
  }
}

export function codeBlockView(
  node: PMNode,
  view: EditorView,
  getPos: () => number | undefined,
  highlightEnabled = false,
): CodeBlockView {
  return new CodeBlockView(node, view, getPos, highlightEnabled);
}
