import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import type { MarkRegistry } from "../directives/types.js";
import { BUILTIN_MARKS } from "../directives/builtin.js";
import { buildOutline, flattenOutline } from "../outline/build.js";
import type { OutlineNode } from "../outline/types.js";

/**
 * تاشدنِ بخش‌های سند.
 *
 * ★ سه قاعدهٔ سختی که این پیاده‌سازی رعایت می‌کند:
 *
 * ۱. حالتِ تاشدگی **هرگز وارد سند نمی‌شود**. اگر واردِ سند شود، در خروجیِ
 *    مارک‌داون هم می‌آید و `serialize(parse(md)) === md` می‌شکند. پس فقط
 *    `Decoration` است — لایه‌ای روی نمایش.
 *
 * ۲. تاکردن **تغییرِ سند نیست**، پس در تاریخچهٔ undo نمی‌آید. کاربری که
 *    یک بخش را می‌بندد و Ctrl+Z می‌زند، انتظار دارد آخرین *ویرایشش* برگردد،
 *    نه اینکه بخش دوباره باز شود.
 *
 * ۳. اگر مکان‌نما داخلِ بخشِ بسته برود (جست‌وجو، کلیکِ پنلِ کناری، Ctrl+End)،
 *    بخش خودکار باز می‌شود. وگرنه کاربر در جایی تایپ می‌کند که نمی‌بیند.
 */

export const foldKey = new PluginKey<FoldState>("tm-fold");

export interface FoldState {
  /** لنگرِ گره‌های بسته. */
  folded: Set<string>;
  decorations: DecorationSet;
}

/** تراکنشی که این متا را داشته باشد، حالتِ تاشدگی را عوض می‌کند. */
interface FoldMeta {
  type: "toggle" | "fold" | "unfold" | "foldAll" | "unfoldAll" | "set";
  id?: string;
  ids?: string[];
  /** برای `foldAll` — فقط تا این عمق ببند. */
  depth?: number;
}

export interface FoldOptions {
  registry?: MarkRegistry;
  /** لنگرهایی که در آغاز بسته‌اند — از localStorage یا از تعریفِ مارک. */
  initial?: string[];
  /** هر بار که حالت عوض شد صدا می‌شود — برای ذخیره در localStorage. */
  onChange?: (folded: string[]) => void;
}

/**
 * متنِ خلاصهٔ چیزی که پنهان شده: «۱۲ بلوکِ پنهان».
 *
 * فقط بلوک‌های **سطحِ اول** شمرده می‌شوند — همان‌هایی که واقعاً پنهان
 * شده‌اند. شمردنِ تودرتو عددِ بی‌معنی می‌دهد: یک کارت با سه پاراگراف
 * داخلش، چهار بار شمرده می‌شود و کاربر «۳۴ بلوک» می‌بیند در حالی که
 * ۱۰ تا پنهان شده.
 */
function summaryText(doc: PMNode, range: { from: number; to: number }): string {
  let blocks = 0;
  doc.nodesBetween(range.from, range.to, (child, pos) => {
    if (pos < range.from || pos + child.nodeSize > range.to) return true;
    if (!child.isBlock) return false;
    blocks++;
    return false; // داخلِ این بلوک نرو
  });
  return blocks > 0 ? `${toFa(blocks)} بلوکِ پنهان` : "پنهان";
}

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toFa(n: number): string {
  return String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]!);
}

/**
 * بازهٔ پنهان‌شونده: از پایانِ خطِ سرفصل تا پایانِ گره.
 *
 * خودِ سرفصل پنهان نمی‌شود — وگرنه کاربر چیزی برای کلیک‌کردن و بازکردن
 * ندارد.
 */
function hiddenRange(doc: PMNode, node: OutlineNode): { from: number; to: number } | null {
  const resolved = doc.nodeAt(node.from);
  if (!resolved) return null;

  if (node.kind === "heading") {
    // سرفصل: از بعدِ خودش تا شروعِ سرفصلِ بعدیِ هم‌سطح یا بالاتر.
    return { from: node.from + resolved.nodeSize, to: node.to };
  }
  // directive: محتوای داخلش، بی خودِ گره.
  return { from: node.from + 1, to: node.to - 1 };
}

/**
 * برای سرفصل، `to`ی درخت فقط خودِ خطِ سرفصل است. محدودهٔ واقعیِ بخش تا
 * سرفصلِ بعدیِ هم‌سطح ادامه دارد و باید جدا حساب شود.
 */
function sectionEnd(doc: PMNode, all: OutlineNode[], node: OutlineNode): number {
  if (node.kind !== "heading") return node.to;
  const flat = flattenOutline(all);
  const idx = flat.findIndex((n) => n.id === node.id);
  for (let i = idx + 1; i < flat.length; i++) {
    if (flat[i]!.level <= node.level) return flat[i]!.from;
  }
  return doc.content.size;
}

function buildDecorations(
  state: EditorState,
  folded: Set<string>,
  registry: MarkRegistry,
): DecorationSet {
  if (folded.size === 0) return DecorationSet.empty;

  const { doc, selection } = state;
  const tree = buildOutline(doc, registry);
  const flat = flattenOutline(tree);
  const decos: Decoration[] = [];

  for (const node of flat) {
    if (!folded.has(node.id)) continue;

    const end = sectionEnd(doc, tree, node);
    const range = hiddenRange(doc, { ...node, to: end });
    if (!range || range.to <= range.from) continue;

    // قاعدهٔ ۳ — مکان‌نما داخلش است، پس بسته نمی‌ماند.
    if (selection.from < range.to && selection.to > range.from) continue;

    doc.nodesBetween(range.from, range.to, (child, pos) => {
      if (pos < range.from || pos + child.nodeSize > range.to) return true;
      if (!child.isBlock) return false;
      decos.push(Decoration.node(pos, pos + child.nodeSize, { class: "tm-folded-hidden" }));
      return false; // فرزندان لازم نیست جدا پنهان شوند
    });

    decos.push(
      Decoration.widget(
        range.from,
        () => {
          const el = document.createElement("button");
          el.type = "button";
          el.className = "tm-fold-summary";
          el.textContent = summaryText(doc, range);
          el.setAttribute("data-fold-id", node.id);
          el.setAttribute("aria-label", `بازکردنِ ${node.title}`);
          return el;
        },
        { side: -1, key: `fold-${node.id}` },
      ),
    );
  }

  return DecorationSet.create(doc, decos);
}

export function foldPlugin(options: FoldOptions = {}): Plugin<FoldState> {
  const registry = options.registry ?? BUILTIN_MARKS;

  return new Plugin<FoldState>({
    key: foldKey,

    state: {
      init(_config, state) {
        const folded = new Set(options.initial ?? []);
        return { folded, decorations: buildDecorations(state, folded, registry) };
      },

      apply(tr, prev, _old, newState) {
        const meta = tr.getMeta(foldKey) as FoldMeta | undefined;
        let folded = prev.folded;

        if (meta) {
          folded = new Set(prev.folded);
          switch (meta.type) {
            case "toggle":
              if (meta.id) {
                if (folded.has(meta.id)) folded.delete(meta.id);
                else folded.add(meta.id);
              }
              break;
            case "fold":
              if (meta.id) folded.add(meta.id);
              break;
            case "unfold":
              if (meta.id) folded.delete(meta.id);
              break;
            case "foldAll": {
              const flat = flattenOutline(buildOutline(newState.doc, registry));
              for (const n of flat) {
                if (meta.depth === undefined || n.level >= meta.depth) folded.add(n.id);
              }
              break;
            }
            case "unfoldAll":
              folded.clear();
              break;
            case "set":
              folded = new Set(meta.ids ?? []);
              break;
          }
          options.onChange?.([...folded]);
        } else if (!tr.docChanged && !tr.selectionSet) {
          return prev;
        }

        return { folded, decorations: buildDecorations(newState, folded, registry) };
      },
    },

    props: {
      decorations(state) {
        return foldKey.getState(state)?.decorations ?? DecorationSet.empty;
      },

      handleClick(view, _pos, event) {
        const target = event.target as HTMLElement;
        const id = target.closest("[data-fold-id]")?.getAttribute("data-fold-id");
        if (!id) return false;
        view.dispatch(view.state.tr.setMeta(foldKey, { type: "toggle", id }));
        return true;
      },
    },
  });
}

/* ── فرمان‌ها ── */

type Dispatch = ((tr: Transaction) => void) | undefined;

export const toggleFold = (id: string) => (state: EditorState, dispatch: Dispatch) => {
  dispatch?.(state.tr.setMeta(foldKey, { type: "toggle", id }));
  return true;
};

export const foldAll = (depth?: number) => (state: EditorState, dispatch: Dispatch) => {
  dispatch?.(state.tr.setMeta(foldKey, { type: "foldAll", depth }));
  return true;
};

export const unfoldAll = () => (state: EditorState, dispatch: Dispatch) => {
  dispatch?.(state.tr.setMeta(foldKey, { type: "unfoldAll" }));
  return true;
};

export const isFolded = (state: EditorState, id: string): boolean =>
  foldKey.getState(state)?.folded.has(id) ?? false;
