import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import type { MarkRegistry } from "../core/directives/types.js";
import { MarkCardView } from "./MarkCard.js";
import { CodeBlockView } from "./CodeBlock.js";
import { MathBlockView, MathInlineView } from "./Math.js";
import { MermaidView } from "./Mermaid.js";
import { HtmlBlockView } from "./HtmlBlock.js";
import { TableOfContentsView } from "./TableOfContents.js";
import { LinkDefinitionView } from "./LinkDefinition.js";
import { InlineDirectiveView } from "./InlineDirective.js";
import type { HtmlMode } from "../core/security.js";
import type { FoldingOptions } from "../core/plugins/fold.js";
import type { MarkCardOptions } from "./MarkCard.js";

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
   * رنگ‌آمیزیِ کد با Shiki. پیش‌فرض **روشن**.
   *
   * ★ تا نسخهٔ قبل خاموش بود: بارگذاریِ Shiki در رشتهٔ اصلی صفحه را چند
   * ثانیه بی‌پاسخ می‌کرد — اندازه‌گیری‌شده در مرورگرِ واقعی، تا حدی که
   * `page.evaluate` هم timeout می‌خورد.
   *
   * حالا رنگ‌آمیزی در **Web Worker** انجام می‌شود (`core/highlight/`)،
   * پس رشتهٔ اصلی اصلاً درگیرِ بارگذاری نیست و دلیلِ خاموش‌بودن از بین
   * رفته است.
   *
   * ★ اگر Shiki نصب نباشد یا Worker در دسترس نباشد، کد **خام** می‌ماند —
   * خوانا و قابلِ ویرایش و قابلِ کپی، فقط بی‌رنگ. خطا نمی‌دهد.
   */
  highlight?: boolean;

  /**
   * رفتار با HTMLِ خام. پیش‌فرض `escape` — امن.
   *
   * حالتِ ناامن (`raw`) باید انتخابِ صریح باشد، نه پیش‌فرض.
   */
  html?: HtmlMode;
}

export interface NodeViewOptions {
  folding?: FoldingOptions;
  cardFolding?: MarkCardOptions;
  locale?: "fa" | "en";
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
  options: NodeViewOptions = {},
): Record<string, NodeViewConstructor> {
  const { math = true, mermaid = false, highlight = true, html = "escape" } = features;

  const views: Record<string, NodeViewConstructor> = {
    directive_block: (node, view, getPos) =>
      new MarkCardView(node, view, getPos, registry, {
        initial: options.folding?.initial,
        mode: options.cardFolding?.mode ?? options.folding?.mode,
        locale: options.locale,
      } satisfies MarkCardOptions),
    table_of_contents: (node, view) => new TableOfContentsView(node, view, options.locale),
    link_definition: (node, view, getPos) => new LinkDefinitionView(node, view, getPos, options.locale),
    directive_inline: (node, view, getPos) =>
      new InlineDirectiveView(node, view, getPos, registry),
  };

  // بلوکِ کد همیشه NodeView دارد — دکمهٔ کپی و برچسبِ زبان مستقل از
  // رنگ‌آمیزی‌اند. `highlight` فقط تعیین می‌کند Shiki بار شود یا نه.
  {
    views.code_block = (node, view, getPos) => {
      if (node.attrs.language === "mermaid") {
        return new MermaidView(node, view, getPos, mermaid, options.locale);
      }
      return new CodeBlockView(node, view, getPos, highlight, options.locale);
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
export { TableOfContentsView } from "./TableOfContents.js";
export { LinkDefinitionView } from "./LinkDefinition.js";
export { InlineDirectiveView } from "./InlineDirective.js";
