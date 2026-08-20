import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode, Mark } from "prosemirror-model";

/**
 * پیش‌نمایشِ زنده — قلبِ کار.
 *
 * رفتار: نشانه‌های مارک‌داون (`**`، `#`، `` ` ``) فقط وقتی دیده می‌شوند که
 * مکان‌نما داخلِ همان بلوک باشد. بیرون که رفت، پنهان می‌شوند و متن
 * رندرشده می‌ماند.
 *
 * ★ چرا Decoration و نه تغییرِ سند:
 * نشانه‌های مارک‌داون **بخشی از سند نیستند**. اگر داخلِ سند بگذاریمشان، در
 * خروجیِ `serialize` هم می‌آیند و `serialize(parse(md)) === md` می‌شکند.
 * پس لایه‌ای روی نمایش‌اند که با حرکتِ مکان‌نما عوض می‌شود.
 *
 * ★ چرا widget و نه inline decoration:
 * نشانه‌ها **متنِ واقعی نیستند** — در سند وجود ندارند. `Decoration.inline`
 * فقط به متنِ موجود کلاس می‌دهد؛ ما باید متنی *اضافه* کنیم که در سند نیست.
 * این دقیقاً کارِ `Decoration.widget` است. مزیتِ جانبی: چون خارج از جریانِ
 * متن‌اند، `position: absolute` کردنشان برای رفعِ پرشِ چیدمان ساده است.
 */

export const livePreviewKey = new PluginKey<LivePreviewState>("tm-live-preview");

export interface LivePreviewState {
  decorations: DecorationSet;
  /** بلوک‌هایی که همین حالا نشانه نشان می‌دهند — برای تست و اشکال‌زدایی. */
  activeBlocks: number[];
}

export interface LivePreviewOptions {
  /**
   * در انتخابِ چندبلوکی، هیچ بلوکی نشانه نشان ندهد.
   *
   * حالتِ ۱ از پنج حالتِ لبه‌ای: اگر کاربر سه پاراگراف را انتخاب کرده و هر
   * سه نشانه نشان دهند، صفحه می‌لرزد. پیش‌فرض: خاموش.
   */
  showOnMultiBlockSelection?: boolean;
}

/** نشانهٔ هر نوع mark. */
function markerFor(mark: Mark): string | null {
  switch (mark.type.name) {
    case "strong":
      return (mark.attrs.marker as string) ?? "**";
    case "em":
      return (mark.attrs.marker as string) ?? "*";
    case "strike":
      return "~~";
    case "code":
      return "`".repeat((mark.attrs.ticks as number) ?? 1);
    default:
      return null;
  }
}

function sameMarks(a: readonly Mark[], b: readonly Mark[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((m) => m.isInSet(b));
}

/** یک نشانهٔ نمایشی می‌سازد. */
function markerWidget(text: string, side: number, key: string): Decoration {
  return Decoration.widget(
    0, // جای واقعی هنگامِ ساخت پر می‌شود
    () => {
      const el = document.createElement("span");
      el.className = "tm-marker";
      el.setAttribute("aria-hidden", "true");
      el.textContent = text;
      return el;
    },
    { side, key, marks: [] },
  );
}

function widgetAt(pos: number, text: string, side: number, key: string): Decoration {
  return Decoration.widget(
    pos,
    () => {
      const el = document.createElement("span");
      el.className = "tm-marker";
      // نشانه بخشی از متن نیست، پس screen reader نباید بخواندش.
      el.setAttribute("aria-hidden", "true");
      el.textContent = text;
      return el;
    },
    {
      side,
      key,
      // بی این، ProseMirror ممکن است widget را بخشی از متن بگیرد و
      // مکان‌نما داخلش گیر کند.
      marks: [],
      ignoreSelection: true,
    },
  );
}

/**
 * نشانه‌های یک بلوکِ فعال را می‌سازد.
 *
 * روی گره‌های متنیِ داخلِ بلوک راه می‌رود و هرجا مجموعهٔ markها عوض شد،
 * نشانهٔ باز یا بسته می‌گذارد. تودرتویی (تأکید داخلِ لینک داخلِ عنوان) با
 * همین روش خودبه‌خود درست کار می‌کند — حالتِ ۲ از پنج حالتِ لبه‌ای.
 */
function decorateBlock(block: PMNode, blockStart: number, out: Decoration[]): void {
  // نشانهٔ بلوکی: `#` برای عنوان.
  if (block.type.name === "heading") {
    const hashes = "#".repeat(block.attrs.level as number) + " ";
    out.push(widgetAt(blockStart + 1, hashes, -1, `h-${blockStart}`));
  }

  if (block.type.name === "blockquote") return; // نشانه‌اش را CSS می‌کشد

  let active: Mark[] = [];
  let offset = blockStart + 1;

  block.forEach((child) => {
    if (!child.isText) {
      offset += child.nodeSize;
      return;
    }

    const marks = child.marks;

    if (!sameMarks(active, marks)) {
      // بسته‌شدنِ آنچه دیگر فعال نیست — از داخلی به بیرونی.
      for (let i = active.length - 1; i >= 0; i--) {
        const m = active[i]!;
        if (!m.isInSet(marks)) {
          const marker = markerFor(m);
          if (marker) out.push(widgetAt(offset, marker, -1, `c-${offset}-${m.type.name}`));
        }
      }
      // بازشدنِ آنچه تازه فعال شده — از بیرونی به داخلی.
      for (const m of marks) {
        if (!m.isInSet(active)) {
          const marker = markerFor(m);
          if (marker) out.push(widgetAt(offset, marker, 1, `o-${offset}-${m.type.name}`));
        }
      }
      active = [...marks];
    }

    offset += child.nodeSize;
  });

  // هرچه در انتها باز مانده، بسته شود.
  for (let i = active.length - 1; i >= 0; i--) {
    const marker = markerFor(active[i]!);
    if (marker) out.push(widgetAt(offset, marker, -1, `e-${offset}-${i}`));
  }
}

/** بلوک‌هایی که مکان‌نما داخلشان است. */
function activeBlocksOf(state: EditorState, allowMulti: boolean): number[] {
  const { from, to } = state.selection;
  const blocks: number[] = [];

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    blocks.push(pos);
    return false;
  });

  // حالتِ ۱: انتخابِ چندبلوکی → هیچ‌کدام.
  if (blocks.length > 1 && !allowMulti) return [];
  return blocks;
}

function build(state: EditorState, options: LivePreviewOptions): LivePreviewState {
  const activeBlocks = activeBlocksOf(state, options.showOnMultiBlockSelection ?? false);
  if (activeBlocks.length === 0) {
    return { decorations: DecorationSet.empty, activeBlocks };
  }

  const decos: Decoration[] = [];
  for (const pos of activeBlocks) {
    const node = state.doc.nodeAt(pos);
    if (node) decorateBlock(node, pos, decos);
  }

  return { decorations: DecorationSet.create(state.doc, decos), activeBlocks };
}

export function livePreviewPlugin(options: LivePreviewOptions = {}): Plugin<LivePreviewState> {
  return new Plugin<LivePreviewState>({
    key: livePreviewKey,

    state: {
      init(_config, state) {
        return build(state, options);
      },
      apply(tr, prev, _old, newState) {
        // فقط وقتی سند یا انتخاب عوض شده. بی این، هر تراکنشِ بی‌ربط
        // (مثلاً تاشدن) کلِ نشانه‌ها را بازمی‌سازد.
        if (!tr.docChanged && !tr.selectionSet) return prev;
        return build(newState, options);
      },
    },

    props: {
      decorations(state) {
        return livePreviewKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
}

/** برای تست و اشکال‌زدایی. */
export function activeBlocks(state: EditorState): number[] {
  return livePreviewKey.getState(state)?.activeBlocks ?? [];
}
