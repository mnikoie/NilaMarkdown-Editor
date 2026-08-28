import { Plugin, PluginKey, Selection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import type { MarkRegistry } from "../directives/types.js";
import { BUILTIN_MARKS } from "../directives/builtin.js";
import { buildOutline, flattenOutline } from "../outline/build.js";
import type { OutlineNode } from "../outline/types.js";
import { preserveScrollAnchor } from "./scroll-anchor.js";

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
  /** ترتیبِ آخرین بازشدنِ گره‌ها، فقط برای یکسان‌سازی هنگامِ فعال‌شدن آکاردئون. */
  openedAt: Map<string, number>;
  sequence: number;
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
  /** عمقِ دیداری را نگه می‌دارد، اما کنترل‌ها و رفتارِ تاشدن را خاموش می‌کند. */
  interactive?: boolean;
  /** هر بار که حالت عوض شد صدا می‌شود — برای ذخیره در localStorage. */
  onChange?: (folded: string[]) => void;
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
      el.setAttribute("aria-label", locale === "en" ? `Show or hide ${node.title}` : `نمایش یا پنهان‌کردنِ ${node.title}`);
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("fill", "none");
      icon.setAttribute("stroke", "currentColor");
      icon.setAttribute("stroke-width", "2");
      icon.setAttribute("stroke-linecap", "round");
      icon.setAttribute("stroke-linejoin", "round");
      icon.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "m6 9 6 6 6-6");
      icon.append(path);
      el.append(icon);
      return el;
    },
    { side: -1, key: `handle-${node.id}`, ignoreSelection: true },
  );
}

function headingForId(view: import("prosemirror-view").EditorView, id: string): HTMLElement | null {
  return [...view.dom.querySelectorAll<HTMLElement>(".tm-heading-accordion[data-fold-id]")]
    .find((item) => item.dataset.foldId === id) ?? null;
}

/** حالتِ باز/بسته روی گرهِ سرفصل — این یکی درست diff می‌شود. */
function outlineDepths(nodes: OutlineNode[]): Map<string, number> {
  const result = new Map<string, number>();
  const visit = (siblings: OutlineNode[], depth: number) => {
    for (const node of siblings) {
      result.set(node.id, depth);
      visit(node.children, depth + 1);
    }
  };
  visit(nodes, 0);
  return result;
}

function foldState(
  node: OutlineNode,
  isFolded: boolean,
  size: number,
  depth: number,
  interactive: boolean,
): Decoration {
  return Decoration.node(node.from, node.from + size, {
    class: "tm-heading-accordion",
    "data-fold-id": node.id,
    "data-foldable": String(interactive),
    "data-folded": String(isFolded),
    "data-tree-depth": String(depth),
    style: `--tm-tree-indent: ${depth * 30}px`,
    ...(interactive ? { "aria-expanded": String(!isFolded) } : {}),
  });
}

function buildDecorations(
  state: EditorState,
  folded: Set<string>,
  registry: MarkRegistry,
  locale: "fa" | "en",
  interactive: boolean,
): DecorationSet {
  const { doc, selection } = state;
  const tree = buildOutline(doc, registry);
  const flat = flattenOutline(tree);
  const depths = outlineDepths(tree);
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
    if (interactive) decos.push(foldHandle(node, locale));
    decos.push(
      foldState(
        node,
        interactive && folded.has(node.id),
        resolved.nodeSize,
        depths.get(node.id) ?? 0,
        interactive,
      ),
    );
  }

  // Markdown بخش‌ها را به‌صورت sibling نگه می‌دارد. برای اینکه محتوای
  // هر بخش واقعاً از لبهٔ کارتِ والد فاصله داشته باشد، تنها بلوک‌های
  // مستقیمِ سند را با عمقِ والدِ structuralشان نشانه‌گذاری می‌کنیم؛
  // ساختار یا متن سند تغییر نمی‌کند.
  doc.forEach((child, pos) => {
    if (child.type.name === "heading") return;
    let owner: OutlineNode | null = null;
    let ownerDepth = -1;
    for (const heading of flat) {
      if (heading.kind !== "heading") continue;
      const headingNode = doc.nodeAt(heading.from);
      if (!headingNode) continue;
      const end = sectionEnd(doc, tree, heading);
      const depth = depths.get(heading.id) ?? 0;
      if (pos >= heading.from + headingNode.nodeSize && pos < end && depth >= ownerDepth) {
        owner = heading;
        ownerDepth = depth;
      }
    }
    if (!owner) return;
    decos.push(Decoration.node(pos, pos + child.nodeSize, {
      class: "tm-section-content",
      "data-section-depth": String(ownerDepth + 1),
      style: `--tm-section-indent: ${(ownerDepth + 1) * 30}px`,
    }));
  });

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

    // directiveها body مستقل دارند؛ پنهان‌کردن فرزندانشان با Decoration
    // دومین لایهٔ visibility و منشأ محتوای ناقص بود.
    if (node.kind !== "heading") continue;

    doc.nodesBetween(range.from, range.to, (child, pos) => {
      if (pos < range.from || pos + child.nodeSize > range.to) return true;
      if (!child.isBlock) return false;
      decos.push(Decoration.node(pos, pos + child.nodeSize, { class: "tm-folded-hidden" }));
      return false; // فرزندان لازم نیست جدا پنهان شوند
    });

  }

  if (decos.length === 0) return DecorationSet.empty;
  return DecorationSet.create(doc, decos);
}

export function foldPlugin(options: FoldOptions = {}): Plugin<FoldState> {
  const registry = options.registry ?? BUILTIN_MARKS;
  const locale = options.locale ?? "fa";
  const foldingEnabled = options.interactive !== false;
  const clickEnabled = options.interactive === true;

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

  const reconcileAccordion = (doc: PMNode, folded: Set<string>, openedAt: ReadonlyMap<string, number>) => {
    const reconcile = (siblings: OutlineNode[]) => {
      const expanded = siblings.filter((node) => !folded.has(node.id));
      if (expanded.length > 1) {
        let keep = expanded[0]!;
        for (const candidate of expanded.slice(1)) {
          const candidateOrder = openedAt.get(candidate.id) ?? -1;
          const keepOrder = openedAt.get(keep.id) ?? -1;
          if (candidateOrder >= keepOrder) keep = candidate;
        }
        for (const sibling of expanded) {
          if (sibling.id !== keep.id) folded.add(sibling.id);
        }
      }
      for (const node of siblings) reconcile(node.children);
    };
    reconcile(buildOutline(doc, registry));
  };

  return new Plugin<FoldState>({
    key: foldKey,

    state: {
      init(_config, state) {
        const folded = new Set<string>(
          !foldingEnabled
            ? []
            : options.initial === "all"
              ? allIds(state.doc)
              : (options.initial ?? []),
        );
        const mode = foldingEnabled ? (options.mode ?? "accordion") : "multiple";
        return {
          folded,
          mode,
          openedAt: new Map(),
          sequence: 0,
          decorations: buildDecorations(state, folded, registry, locale, foldingEnabled),
        };
      },

      apply(tr, prev, _oldState, newState) {
        const meta = foldingEnabled ? (tr.getMeta(foldKey) as FoldMeta | undefined) : undefined;
        let folded = prev.folded;
        let mode = prev.mode;
        let openedAt = prev.openedAt;
        let sequence = prev.sequence;

        if (meta) {
          folded = new Set(prev.folded);
          openedAt = new Map(prev.openedAt);
          switch (meta.type) {
            case "toggle":
              if (meta.id) {
                if (folded.has(meta.id)) {
                  folded.delete(meta.id);
                  sequence += 1;
                  openedAt.set(meta.id, sequence);
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
              if (meta.mode) {
                mode = meta.mode;
                if (mode === "accordion") reconcileAccordion(newState.doc, folded, openedAt);
              }
              break;
          }
          options.onChange?.([...folded]);
        } else if (!tr.docChanged && !tr.selectionSet) {
          return prev;
        }

        return {
          folded,
          mode,
          openedAt,
          sequence,
          decorations: buildDecorations(newState, folded, registry, locale, foldingEnabled),
        };
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
        // در حالتِ غیرتعاملی، عنوان فقط عمقِ دیداری می‌گیرد و کلیک روی آن
        // هیچ تغییری در نمایشِ سند ایجاد نمی‌کند.
        mousedown(view, event) {
          if (!clickEnabled) return false;
          const target = event.target as HTMLElement;
          if (event.button !== 0) return false;
          // کنترل‌های واقعیِ درونِ سرفصل نباید با کلیک، بخش را تا کنند.
          // خودِ متنِ سرفصل عمداً کنترلِ آکاردئون است تا رفتارِ headingها
          // با کارت‌های directive یکی باشد.
          if (target.closest("a, input, select, textarea, [role='button'], [data-no-fold-toggle]")) return false;
          const control = target.closest<HTMLElement>(".tm-inline-fold");
          const header = target.closest<HTMLElement>(".tm-heading-accordion[data-fold-id]");
          const id = control?.dataset.foldId ?? header?.dataset.foldId;
          if (!id) return false;
          // جلوی گرفتنِ فوکوس و جابه‌جاییِ مکان‌نما را بگیر.
          event.preventDefault();
          const opening = foldKey.getState(view.state)?.folded.has(id) ?? false;
          const node = flattenOutline(buildOutline(view.state.doc, registry)).find((item) => item.id === id);
          preserveScrollAnchor(() => headingForId(view, id), () => {
            let tr = view.state.tr;
            if (!opening && node) {
              const range = hiddenRange(view.state.doc, {
                ...node,
                to: sectionEnd(view.state.doc, buildOutline(view.state.doc, registry), node),
              });
              // فقط اگر caret واقعاً قرار است پنهان شود جابه‌جایش کن.
              // جابه‌جاییِ بی‌دلیل selection در Chrome اسکرول را تکان می‌دهد.
              const selectionIsInNode =
                view.state.selection.from >= node.from && view.state.selection.to <= node.to;
              if ((range && view.state.selection.from < range.to && view.state.selection.to > range.from) || selectionIsInNode) {
                const pos = Math.min(node.from + 1, view.state.doc.content.size);
                tr = tr.setSelection(Selection.near(view.state.doc.resolve(pos)));
              }
            }
            view.dispatch(tr.setMeta(foldKey, { type: "toggle", id }));
          });
          return true;
        },
      },
    },

    // سرفصل‌های Markdown در مدلِ ProseMirror sibling هستند، نه parent.
    // این لایه فقط قابِ ارائه را برای همان بازهٔ واقعی می‌کشد؛ هیچ گره،
    // محتوا یا رخدادِ تعاملی را جابه‌جا نمی‌کند.
    view(view) {
      const host = view.dom.parentElement;
      if (!host) return {};

      const layer = document.createElement("div");
      layer.className = "tm-section-frames";
      layer.setAttribute("aria-hidden", "true");
      host.classList.add("tm-section-frame-host");
      host.append(layer);
      let timer: number | null = null;

      const render = () => {
        timer = null;
        layer.replaceChildren();
        const tree = buildOutline(view.state.doc, registry);
        const flat = flattenOutline(tree);
        const depths = outlineDepths(tree);
        const folded = foldKey.getState(view.state)?.folded ?? new Set<string>();
        const hostRect = host.getBoundingClientRect();
        // روی سند واقعی بیش از صد عنوان داریم. پیدا‌کردنِ DOM و مرز بعدی
        // داخلِ حلقه، هر بار O(n²) می‌شد و بازوبسته‌کردنِ پشتِ‌هم را کند
        // می‌کرد؛ همهٔ نگاشت‌ها را یک‌بار برای همین فریم می‌سازیم.
        const headingNodes = flat.filter((node) => node.kind === "heading");
        const headings = new Map<string, HTMLElement>();
        for (const handle of view.dom.querySelectorAll<HTMLElement>(".tm-inline-fold")) {
          const id = handle.dataset.foldId;
          const heading = handle.parentElement;
          if (id && heading) headings.set(id, heading);
        }
        const headingRects = new Map(
          [...headings].map(([id, heading]) => [id, heading.getBoundingClientRect()] as const),
        );
        const nextBoundary = new Map<string, string>();
        const boundaryStack: OutlineNode[] = [];
        for (let index = headingNodes.length - 1; index >= 0; index--) {
          const node = headingNodes[index]!;
          while (boundaryStack.length && boundaryStack.at(-1)!.level > node.level) {
            boundaryStack.pop();
          }
          const next = boundaryStack.at(-1);
          if (next) nextBoundary.set(node.id, next.id);
          boundaryStack.push(node);
        }
        const editorBottom = view.dom.getBoundingClientRect().bottom;

        for (const node of headingNodes) {
          if (folded.has(node.id)) continue;
          const heading = headings.get(node.id);
          const headingRect = headingRects.get(node.id);
          if (!heading?.isConnected || !headingRect) continue;
          const nextId = nextBoundary.get(node.id);
          const afterRect = nextId ? headingRects.get(nextId) : null;
          // خطِ سلسله‌مراتب از زیرِ سربرگ شروع می‌شود، نه دورِ کل بخش.
          // قابِ مستطیلیِ تمام‌قد روی سندهای واقعی چند لایه کادر در کادر
          // می‌ساخت و متن را شبیه فرمِ دیباگ نشان می‌داد.
          const top = headingRect.bottom + 6;
          const bottom = afterRect ? afterRect.top - 8 : editorBottom;
          const height = Math.round(bottom - top);
          if (height <= 4) continue;

          const frame = document.createElement("div");
          frame.className = "tm-section-frame";
          frame.dataset.depth = String(depths.get(node.id) ?? 0);
          frame.style.insetBlockStart = `${Math.round(top - hostRect.top)}px`;
          frame.style.blockSize = `${height}px`;
          frame.style.insetInlineStart = `${(depths.get(node.id) ?? 0) * 30}px`;
          layer.append(frame);
        }
      };
      const schedule = () => {
        if (timer !== null) return;
        timer = window.setTimeout(render, 0);
      };
      const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
      observer?.observe(view.dom);
      schedule();
      return {
        update: schedule,
        destroy() {
          if (timer !== null) window.clearTimeout(timer);
          observer?.disconnect();
          layer.remove();
          host.classList.remove("tm-section-frame-host");
        },
      };
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
      const tree = buildOutline(state.doc, BUILTIN_MARKS);
      const node = from === undefined
        ? flattenOutline(tree).find((item) => item.id === id)
        : flattenOutline(tree).find((item) => item.from === from);
      if (node) {
        const range = hiddenRange(state.doc, {
          ...node,
          to: sectionEnd(state.doc, tree, node),
        });
        const selectionIsInNode = state.selection.from >= node.from && state.selection.to <= node.to;
        if ((range && state.selection.from < range.to && state.selection.to > range.from) || selectionIsInNode) {
        const pos = Math.min(node.from + 1, state.doc.content.size);
        tr = tr.setSelection(Selection.near(state.doc.resolve(pos)));
        }
      }
    }
    dispatch(tr.setMeta(foldKey, { type: "toggle", id }));
  }
  return true;
};

/** فرمانِ کنترل‌های React/NodeView با نگه‌داشتن جای عنوان در viewport. */
export function toggleFoldPreservingScroll(
  view: import("prosemirror-view").EditorView,
  id: string,
  from?: number,
): boolean {
  preserveScrollAnchor(() => headingForId(view, id), () => {
    toggleFold(id, from)(view.state, view.dispatch);
  });
  return true;
}

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
