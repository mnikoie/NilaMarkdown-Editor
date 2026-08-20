import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView, ViewMutationRecord } from "prosemirror-view";

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
 */

/** بارگذاریِ تنبل — یک‌بار برای کلِ برنامه. */
let shikiLoader: Promise<ShikiHighlighter | null> | null = null;

interface ShikiHighlighter {
  codeToHtml(code: string, options: { lang: string; themes: { light: string; dark: string } }): string;
  getLoadedLanguages(): string[];
  loadLanguage(lang: string): Promise<void>;
}

/**
 * محیط، مرورگرِ واقعی است؟
 *
 * Shiki و Mermaid به APIهایی نیاز دارند که jsdom و Node ندارند (WASM،
 * Canvas، اندازه‌گیریِ متن). بارگذاری‌شان آنجا فقط وقت می‌گیرد و در
 * بهترین حالت شکست می‌خورد — در بدترین حالت پروسه را می‌کُشد.
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
 * ★ چرا این‌طور و نه `import("shiki")` مستقیم: باندلرها (Vite، webpack)
 * `import()`ِ با رشتهٔ ثابت را **در زمانِ بیلد** پیدا می‌کنند و پکیج را
 * از پیش آماده می‌کنند — حتی اگر در زمانِ اجرا هرگز صدا نشود. برای
 * Shiki که ده‌ها مگابایت گرامر دارد، این یعنی تستِ ۱ ثانیه‌ای به ۹۰
 * ثانیه می‌رسد و گاهی پروسه می‌میرد.
 *
 * با متغیر، تحلیلِ ایستا نمی‌تواند اسم را بفهمد و پکیج فقط وقتی بار
 * می‌شود که واقعاً لازم شود — که هدفِ «وابستگیِ اختیاری» هم همین بود.
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

/**
 * جدولِ بارگذارها.
 *
 * ★ چرا جدول و نه `import(name)`ِ مستقیم:
 *
 * - با **رشتهٔ ثابت** (`import("shiki")`)، باندلر پکیج را پیدا و آماده
 *   می‌کند. درست است، ولی Vite در تست هم همین کار را می‌کند و ۹۰ ثانیه
 *   طول می‌کشد.
 * - با **متغیر** (`import(name)`)، باندلر نمی‌فهمد چه چیزی لازم است و
 *   یا context-require می‌سازد یا — با `webpackIgnore` — رشته را
 *   دست‌نخورده به مرورگر می‌دهد که `Failed to resolve module specifier`
 *   می‌گیرد. اندازه‌گیری شد: KaTeX هرگز بار نمی‌شد.
 *
 * جدول هر دو را حل می‌کند: رشته‌ها ثابت‌اند پس باندلر درست کار می‌کند، و
 * چون داخلِ تابع‌های تنبل‌اند، فقط با صداکردن اجرا می‌شوند.
 */
const OPTIONAL_LOADERS: Record<string, () => Promise<unknown>> = {
  katex: () => import("katex"),
  shiki: () => import("shiki"),
  mermaid: () => import("mermaid"),
};

async function loadShiki(): Promise<ShikiHighlighter | null> {
  if (!isRealBrowser()) return null;
  try {
    const shiki = await importOptional<{
      createHighlighter: (o: unknown) => Promise<ShikiHighlighter>;
    }>("shiki");
    if (!shiki) return null;
    return await shiki.createHighlighter({
      // ★ هیچ زبانی از پیش بار نمی‌شود.
      //
      // نسخهٔ اول ده زبان و دو تم را با هم می‌گرفت. نتیجه: رشتهٔ اصلی
      // چند ثانیه قفل می‌شد و صفحه اصلاً پاسخ نمی‌داد — حتی
      // `page.evaluate` هم timeout می‌خورد. هر زبان فقط وقتی بار می‌شود
      // که سندی واقعاً از آن استفاده کند (`loadLanguage` در `highlight`).
      themes: ["github-light", "github-dark"],
      langs: [],
    });
  } catch {
    return null;
  }
}

function getShiki(): Promise<ShikiHighlighter | null> {
  // بیرونِ مرورگر اصلاً promise نساز — نه حتی یکِ حل‌شده. در محیطِ تست،
  // promiseهای معلق باعث می‌شوند worker تمام نشود.
  if (!isRealBrowser()) return Promise.resolve(null);
  shikiLoader ??= loadShiki();
  return shikiLoader;
}

export class CodeBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;

  private pre: HTMLPreElement;
  private highlightLayer: HTMLElement;
  private langLabel: HTMLElement;
  private copyButton: HTMLButtonElement;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
    /** اگر خاموش باشد، Shiki اصلاً بار نمی‌شود. */
    private highlightEnabled = false,
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
    this.copyButton.textContent = "کپی";
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
    this.langLabel.textContent = lang || "متن";
    this.dom.setAttribute("data-language", lang);
    this.highlighted = this.highlight();
  }

  private async highlight() {
    const lang = this.language;
    const code = this.node.textContent;

    if (!lang || !code) {
      this.highlightLayer.textContent = "";
      this.dom.removeAttribute("data-highlighted");
      return;
    }

    if (!this.highlightEnabled) {
      this.highlightLayer.textContent = "";
      this.dom.setAttribute("data-highlighted", "false");
      return;
    }

    const shiki = await getShiki();
    if (this.destroyed) return;

    // Shiki نصب نیست → کدِ خام. این حالتِ عادی است، نه خطا.
    if (!shiki) {
      this.highlightLayer.textContent = "";
      this.dom.setAttribute("data-highlighted", "false");
      return;
    }

    try {
      if (!shiki.getLoadedLanguages().includes(lang)) {
        await shiki.loadLanguage(lang);
        if (this.destroyed) return;
      }
      this.highlightLayer.innerHTML = shiki.codeToHtml(code, {
        lang,
        themes: { light: "github-light", dark: "github-dark" },
      });
      this.dom.setAttribute("data-highlighted", "true");
    } catch {
      // زبانِ ناشناخته → خام. باز هم نه خطا.
      this.highlightLayer.textContent = "";
      this.dom.setAttribute("data-highlighted", "false");
    }
  }

  private async copy() {
    const text = this.node.textContent;
    try {
      await navigator.clipboard.writeText(text);
      this.copyButton.textContent = "کپی شد ✓";
    } catch {
      this.copyButton.textContent = "کپی نشد";
    }
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => {
      this.copyButton.textContent = "کپی";
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
    return this.highlightLayer.contains(mutation.target);
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
