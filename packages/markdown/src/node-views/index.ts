import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import type { MarkRegistry } from "../core/directives/types.js";
import { MarkCardView } from "./MarkCard.js";
import { CodeBlockView } from "./CodeBlock.js";
import { MathBlockView, MathInlineView } from "./Math.js";
import { MermaidView } from "./Mermaid.js";
import { HtmlBlockView } from "./HtmlBlock.js";
import type { HtmlMode } from "../core/security.js";

export interface Features {
  /**
   * ریاضی با KaTeX. پیش‌فرض **روشن** — سبک است و رشتهٔ اصلی را قفل
   * نمی‌کند (اندازه‌گیری‌شده در مرورگرِ واقعی).
   */
  math?: boolean;

  /**
   * نمودارِ Mermaid. پیش‌فرض **خاموش**، به دو دلیل:
   *
   * ۱. امنیت (بندِ ۱۱): کدِ دلخواه اجرا می‌کند.
   * ۲. کارایی: بارگذاری‌اش رشتهٔ اصلی را چند ثانیه قفل می‌کند.
   */
  mermaid?: boolean;

  /**
   * رنگ‌آمیزیِ کد با Shiki. پیش‌فرض **خاموش**.
   *
   * ★ چرا خاموش: در مرورگرِ واقعی اندازه گرفتم — بارگذاریِ Shiki (موتورِ
   * WASM) صفحه را چند ثانیه بی‌پاسخ می‌کند، تا حدی که `page.evaluate`
   * هم timeout می‌خورد. حتی با `langs: []` هم همین است، پس مسئله
   * گرامرها نیستند بلکه خودِ ماژول است.
   *
   * بی آن، کد **خوانا و قابلِ ویرایش** است، فقط بی‌رنگ. این معاملهٔ
   * درستی است: صفحه‌ای که کار می‌کند بهتر از صفحهٔ رنگیِ قفل‌شده است.
   *
   * اگر می‌خواهیدش، صریح روشنش کنید — ترجیحاً پس از انتقالِ رنگ‌آمیزی
   * به Web Worker (بندِ ۱۳ پرامپت).
   */
  highlight?: boolean;

  /**
   * رفتار با HTMLِ خام. پیش‌فرض `escape` — امن.
   *
   * حالتِ ناامن (`raw`) باید انتخابِ صریح باشد، نه پیش‌فرض.
   */
  html?: HtmlMode;
}

type NodeViewConstructor = (
  node: PMNode,
  view: EditorView,
  getPos: () => number | undefined,
) => NodeView;

/**
 * همهٔ NodeViewها یک‌جا.
 *
 * ★ بلوکِ کد و Mermaid یک گرهِ یکسان‌اند (`code_block`) و بر اساسِ
 * `language` از هم جدا می‌شوند. ProseMirror برای هر نوعِ گره فقط یک
 * سازنده می‌پذیرد، پس انتخاب داخلِ همان سازنده انجام می‌شود.
 */
export function createNodeViews(
  registry: MarkRegistry,
  features: Features = {},
): Record<string, NodeViewConstructor> {
  const { math = true, mermaid = false, highlight = false, html = "escape" } = features;

  const views: Record<string, NodeViewConstructor> = {
    directive_block: (node, view, getPos) => new MarkCardView(node, view, getPos, registry),
  };

  // بلوکِ کد همیشه NodeView دارد — دکمهٔ کپی و برچسبِ زبان مستقل از
  // رنگ‌آمیزی‌اند. `highlight` فقط تعیین می‌کند Shiki بار شود یا نه.
  {
    views.code_block = (node, view, getPos) => {
      if (node.attrs.language === "mermaid") {
        return new MermaidView(node, view, getPos, mermaid);
      }
      return new CodeBlockView(node, view, getPos, highlight);
    };
  }

  views.html_block = (node, view, getPos) => new HtmlBlockView(node, view, getPos, html);

  if (math) {
    views.math_block = (node, view, getPos) => new MathBlockView(node, view, getPos);
    views.math_inline = (node, view, getPos) => new MathInlineView(node, view, getPos);
  }

  return views;
}

export { MarkCardView, markCardViews } from "./MarkCard.js";
export { CodeBlockView } from "./CodeBlock.js";
export { MathBlockView, MathInlineView } from "./Math.js";
export { MermaidView } from "./Mermaid.js";
export { HtmlBlockView } from "./HtmlBlock.js";
