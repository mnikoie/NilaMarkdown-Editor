import { Plugin, PluginKey, Selection } from "prosemirror-state";
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
  mode: FoldMode;
}

export type FoldInitialState = "collapsed" | "expanded";
export type FoldMode = "accordion" | "multiple";

/** تنظیمِ عمومیِ همهٔ نودهای بازوبسته‌شوندهٔ ویرایشگر. */
export interface FoldingOptions {
  /** پیش‌فرضِ اولین نمایش. */
  initial?: FoldInitialState;
  /** آکاردئون فقط یک گرهٔ هم‌سطح را باز نگه می‌دارد. */
  mode?: FoldMode;
}

/** تراکنشی که این متا را داشته باشد، حالتِ تاشدگی را عوض می‌کند. */
interface FoldMeta {
  type: "toggle" | "fold" | "unfold" | "foldAll" | "unfoldAll" | "set" | "setMode";
  id?: string;
  ids?: string[];
  /** برای `foldAll` — فقط تا این عمق ببند. */
  depth?: number;
  mode?: FoldMode;
}

export interface FoldOptions {
  registry?: MarkRegistry;
  /** لنگرهایی که در آغاز بسته‌اند — از localStorage یا از تعریفِ مارک. */
  initial?: string[] | "all";
  mode?: FoldMode;
  locale?: "fa" | "en";
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
function summaryText(
  doc: PMNode,
  range: { from: number; to: number },
  locale: "fa" | "en",
): string {
  let blocks = 0;
  doc.nodesBetween(range.from, range.to, (child, pos) => {
    if (pos < range.from || pos + child.nodeSize > range.to) return true;
    if (!child.isBlock) return false;
    blocks++;
    return false; // داخلِ این بلوک نرو
  });
  if (locale === "en") {
    return blocks > 0
      ? `${blocks.toLocaleString("en-US")} hidden ${blocks === 1 ? "block" : "blocks"}`
      : "Hidden";
  }
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

/**
 * مثلثِ تاشدن کنارِ سرفصل — **در خودِ متن**، نه فقط در پنلِ کناری.
 *
 * ★ چرا widget و نه دکمهٔ واقعی در سند: هر چیزی که وارد سند شود، وارد
 * مارک‌داون هم می‌شود و رفت‌وبرگشت را می‌شکند. این فقط لایهٔ نمایش است —
 * همان قاعدهٔ ۱ بالای فایل.
 *
 * ★ `side: -1` تا **پیش از** متنِ سرفصل بنشیند، و
 * `ignoreSelection` تا کلیک روی آن مکان‌نما را نپراند.
 */
/**
 * مثلثِ تاشدن کنارِ سرفصل — **در خودِ متن**، نه فقط در پنلِ کناری.
 *
 * ★ چرا widget و نه چیزی در سند: هر چیزی که وارد سند شود، وارد
 * مارک‌داون هم می‌شود و رفت‌وبرگشت را می‌شکند. این فقط لایهٔ نمایش است —
 * همان قاعدهٔ ۱ بالای فایل.
 *
 * ★ **حالتِ باز/بسته روی خودِ سرفصل می‌نشیند، نه روی دکمه.**
 *
 * این تنها راهی بود که کار کرد، و دو تلاشِ ناموفق پشتش است:
 *
 * ۱. `key` شاملِ حالت (`handle-${id}-${isFolded}`): با هر تاکردن
 *    ProseMirror دکمه را دور می‌انداخت و از نو می‌ساخت. کلیکِ بعدیِ
 *    کاربر روی عنصرِ جداشده می‌نشست و بخش دیگر باز نمی‌شد.
 *
 * ۲. `key` ثابت + به‌روزکردنِ صفت داخلِ سازنده: ProseMirror widget را
 *    با کلید cache می‌کند و سازنده را **اصلاً دوباره صدا نمی‌زند**، پس
 *    `aria-expanded` روی `true` می‌ماند در حالی که بخش بسته است —
 *    یعنی صفحه‌خوان دروغ می‌شنود. در مرورگر اندازه‌گیری شد.
 *
 * `Decoration.node` بر اساسِ **صفات** مقایسه می‌شود نه کلید، پس با
 * تغییرِ حالت درست به‌روز می‌شود. دکمه ثابت می‌ماند (کلیک نمی‌شکند) و
 * CSS از روی صفتِ والد، جهتِ مثلث را می‌چرخاند.
 */
function foldHandle(node: OutlineNode, locale: "fa" | "en"): Decoration {
  return Decoration.widget(
    node.from + 1,
    () => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "tm-inline-fold";
      el.setAttribute("data-fold-id", node.id);
      el.setAttribute("contenteditable", "false");
      el.setAttribute("aria-label", locale === "en" ? `Toggle ${node.title}` : `باز و بسته‌کردنِ ${node.title}`);
      el.textContent = "⌄";
      return el;
    },
    { side: -1, key: `handle-${node.id}`, ignoreSelection: true },
  );
}

/** حالتِ باز/بسته روی گرهِ سرفصل — این یکی درست diff می‌شود. */
function foldState(node: OutlineNode, isFolded: boolean, size: number): Decoration {
  return Decoration.node(node.from, node.from + size, {
    "data-folded": String(isFolded),
    "aria-expanded": String(!isFolded),
  });
}

function buildDecorations(
  state: EditorState,
  folded: Set<string>,
  registry: MarkRegistry,
  locale: "fa" | "en",
): DecorationSet {
  const { doc, selection } = state;
  const tree = buildOutline(doc, registry);
  const flat = flattenOutline(tree);
  const decos: Decoration[] = [];
  const hiddenByFoldedAncestor = new Set<string>();
  const markHiddenDescendants = (nodes: OutlineNode[], ancestorFolded: boolean) => {
    for (const node of nodes) {
      if (ancestorFolded) hiddenByFoldedAncestor.add(node.id);
      markHiddenDescendants(node.children, ancestorFolded || folded.has(node.id));
    }
  };
  markHiddenDescendants(tree, false);

  // ★ مثلث برای **همهٔ** سرفصل‌هایی که چیزی زیرشان هست — نه فقط
  // بسته‌ها. وگرنه کاربر راهی برای بستنِ یک بخشِ باز ندارد.
  for (const node of flat) {
    if (node.kind !== "heading") continue;
    const end = sectionEnd(doc, tree, node);
    const resolved = doc.nodeAt(node.from);
    // بخشِ خالی مثلث نمی‌گیرد — دکمه‌ای که کاری نمی‌کند بدتر از نبودنش است.
    if (!resolved || end <= node.from + resolved.nodeSize) continue;
    decos.push(foldHandle(node, locale));
    decos.push(foldState(node, folded.has(node.id), resolved.nodeSize));
  }

  for (const node of flat) {
    if (!folded.has(node.id)) continue;
    // والدِ بسته خودش کلِ این زیرشاخه را پنهان می‌کند. خلاصهٔ فرزند اگر
    // جدا ساخته شود بیرونِ گرهٔ پنهان می‌افتد و چند pill بی‌معنی کنارِ
    // خلاصهٔ والد دیده می‌شود.
    if (hiddenByFoldedAncestor.has(node.id)) continue;

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
          el.textContent = summaryText(doc, range, locale);
          el.setAttribute("data-fold-id", node.id);
          el.setAttribute("aria-label", locale === "en" ? `Expand ${node.title}` : `بازکردنِ ${node.title}`);
          return el;
        },
        { side: -1, key: `fold-${node.id}` },
      ),
    );
  }

  if (decos.length === 0) return DecorationSet.empty;
  return DecorationSet.create(doc, decos);
}

export function foldPlugin(options: FoldOptions = {}): Plugin<FoldState> {
  const registry = options.registry ?? BUILTIN_MARKS;
  const locale = options.locale ?? "fa";

  const allIds = (doc: PMNode) => flattenOutline(buildOutline(doc, registry)).map((node) => node.id);

  const siblingIds = (doc: PMNode, id: string): string[] => {
    const walk = (nodes: OutlineNode[]): string[] | null => {
      if (nodes.some((node) => node.id === id)) return nodes.filter((node) => node.id !== id).map((node) => node.id);
      for (const node of nodes) {
        const found = walk(node.children);
        if (found) return found;
      }
      return null;
    };
    return walk(buildOutline(doc, registry)) ?? [];
  };

  return new Plugin<FoldState>({
    key: foldKey,

    state: {
      init(_config, state) {
        const folded = new Set(options.initial === "all" ? allIds(state.doc) : (options.initial ?? []));
        const mode = options.mode ?? "accordion";
        return { folded, mode, decorations: buildDecorations(state, folded, registry, locale) };
      },

      apply(tr, prev, _old, newState) {
        const meta = tr.getMeta(foldKey) as FoldMeta | undefined;
        let folded = prev.folded;
        let mode = prev.mode;

        if (meta) {
          folded = new Set(prev.folded);
          switch (meta.type) {
            case "toggle":
              if (meta.id) {
                if (folded.has(meta.id)) {
                  folded.delete(meta.id);
                  if (mode === "accordion") {
                    for (const sibling of siblingIds(newState.doc, meta.id)) folded.add(sibling);
                  }
                }
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
            case "setMode":
              if (meta.mode) mode = meta.mode;
              break;
          }
          options.onChange?.([...folded]);
        } else if (!tr.docChanged && !tr.selectionSet) {
          return prev;
        }

        return { folded, mode, decorations: buildDecorations(newState, folded, registry, locale) };
      },
    },

    props: {
      decorations(state) {
        return foldKey.getState(state)?.decorations ?? DecorationSet.empty;
      },

      /**
       * ★ `mousedown` و نه `click`.
       *
       * `Decoration.node` روی سرفصل باعث می‌شود ProseMirror با هر تغییرِ
       * حالت، DOMِ آن گره را از نو بسازد. اگر منتظرِ `click` بمانیم، دکمه
       * بینِ `mousedown` و `mouseup` جایگزین شده و رویدادِ `click` هرگز
       * کامل نمی‌شود — در مرورگر دیده شد: بستن کار می‌کرد ولی بازکردن نه.
       *
       * `mousedown` قبل از هر بازسازی می‌رسد.
       */
      handleDOMEvents: {
        mousedown(view, event) {
          const target = event.target as HTMLElement;
          const id = target.closest("[data-fold-id]")?.getAttribute("data-fold-id");
          if (!id) return false;
          // جلوی گرفتنِ فوکوس و جابه‌جاییِ مکان‌نما را بگیر.
          event.preventDefault();
          const opening = foldKey.getState(view.state)?.folded.has(id) ?? false;
          const node = flattenOutline(buildOutline(view.state.doc, registry)).find((item) => item.id === id);
          let tr = view.state.tr;
          if (!opening && node) {
            const pos = Math.min(node.from + 1, view.state.doc.content.size);
            tr = tr.setSelection(Selection.near(view.state.doc.resolve(pos)));
          }
          view.dispatch(tr.setMeta(foldKey, { type: "toggle", id }));
          return true;
        },
      },
    },
  });
}

/* ── فرمان‌ها ── */

type Dispatch = ((tr: Transaction) => void) | undefined;

export const toggleFold = (id: string, from?: number) => (state: EditorState, dispatch: Dispatch) => {
  if (dispatch) {
    let tr = state.tr;
    const pluginState = foldKey.getState(state);
    if (pluginState && !pluginState.folded.has(id)) {
      const node = from === undefined
        ? flattenOutline(buildOutline(state.doc, BUILTIN_MARKS)).find((item) => item.id === id)
        : { from };
      if (node) {
        const pos = Math.min(node.from + 1, state.doc.content.size);
        tr = tr.setSelection(Selection.near(state.doc.resolve(pos)));
      }
    }
    dispatch(tr.setMeta(foldKey, { type: "toggle", id }));
  }
  return true;
};

export const foldAll = (depth?: number) => (state: EditorState, dispatch: Dispatch) => {
  if (dispatch) {
    const first = flattenOutline(buildOutline(state.doc, BUILTIN_MARKS))[0];
    const pos = Math.min((first?.from ?? 0) + 1, state.doc.content.size);
    dispatch(
      state.tr
        .setSelection(Selection.near(state.doc.resolve(pos)))
        .setMeta(foldKey, { type: "foldAll", depth }),
    );
  }
  return true;
};

export const unfoldAll = () => (state: EditorState, dispatch: Dispatch) => {
  dispatch?.(state.tr.setMeta(foldKey, { type: "unfoldAll" }));
  return true;
};

export const setFoldMode = (mode: FoldMode) => (state: EditorState, dispatch: Dispatch) => {
  dispatch?.(state.tr.setMeta(foldKey, { type: "setMode", mode }));
  return true;
};

export const isFolded = (state: EditorState, id: string): boolean =>
  foldKey.getState(state)?.folded.has(id) ?? false;
