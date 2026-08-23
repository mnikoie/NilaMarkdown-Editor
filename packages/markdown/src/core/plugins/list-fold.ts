import { Plugin, PluginKey, Selection } from "prosemirror-state";
import type { Command, EditorState, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../schema/index.js";
import { preserveScrollAnchor } from "./scroll-anchor.js";

export interface ListFoldState {
  /** موقعیتِ list_itemهایی که زیرگره‌هایشان بسته است. */
  folded: Set<number>;
  decorations: DecorationSet;
  mode: "accordion" | "multiple";
  openedAt: Map<number, number>;
  sequence: number;
}

interface ListFoldMeta {
  type: "toggle" | "foldAll" | "unfoldAll" | "setMode";
  pos?: number;
  mode?: "accordion" | "multiple";
}

export interface ListFoldOptions {
  initial?: "collapsed" | "expanded";
  mode?: "accordion" | "multiple";
  locale?: "fa" | "en";
}

export const listFoldKey = new PluginKey<ListFoldState>("tm-list-fold");

function nestedLists(node: PMNode, pos: number): Array<{ node: PMNode; pos: number }> {
  const result: Array<{ node: PMNode; pos: number }> = [];
  node.forEach((child, offset) => {
    if (child.type === schema.nodes.bullet_list || child.type === schema.nodes.ordered_list) {
      result.push({ node: child, pos: pos + 1 + offset });
    }
  });
  return result;
}

function foldableItems(doc: PMNode): Array<{ node: PMNode; pos: number; parentPos: number; nested: ReturnType<typeof nestedLists> }> {
  const items: Array<{ node: PMNode; pos: number; parentPos: number; nested: ReturnType<typeof nestedLists> }> = [];
  doc.descendants((node, pos) => {
    if (node.type !== schema.nodes.list_item) return true;
    const nested = nestedLists(node, pos);
    if (nested.length) {
      const $pos = doc.resolve(pos);
      items.push({ node, pos, parentPos: $pos.depth > 0 ? $pos.before($pos.depth) : 0, nested });
    }
    return true;
  });
  return items;
}

function buildDecorations(state: EditorState, folded: Set<number>, locale: "fa" | "en"): DecorationSet {
  const decorations: Decoration[] = [];
  for (const item of foldableItems(state.doc)) {
    const isFolded = folded.has(item.pos);
    decorations.push(
      Decoration.widget(
        item.pos + 1,
        () => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "tm-list-fold-toggle";
          button.contentEditable = "false";
          button.dataset.listFoldPos = String(item.pos);
          button.setAttribute(
            "aria-label",
            locale === "en"
              ? (isFolded ? "Expand child nodes" : "Collapse child nodes")
              : (isFolded ? "بازکردنِ زیرگره‌ها" : "بستنِ زیرگره‌ها"),
          );
          button.setAttribute("aria-expanded", String(!isFolded));
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
          button.append(icon);
          return button;
        },
        { side: -1, key: `list-fold-${item.pos}`, ignoreSelection: true },
      ),
      Decoration.node(item.pos, item.pos + item.node.nodeSize, {
        "data-list-folded": String(isFolded),
        class: "tm-list-node",
      }),
    );

    if (!isFolded) continue;
    for (const nested of item.nested) {
      // ★ فقط وقتی پنهان‌سازی لغو می‌شود که مکان‌نما **واقعاً داخلِ** محتوای
      // زیرفهرست باشد. مرزها بیرون حساب می‌شوند: با `<` و `>` ساده، یک
      // مکان‌نمای چسبیده به لبه هم «داخل» شمرده می‌شد و بستنِ بند بی‌اثر
      // می‌ماند.
      const innerFrom = nested.pos + 1;
      const innerTo = nested.pos + nested.node.nodeSize - 1;
      const selectionInside =
        state.selection.from >= innerFrom && state.selection.to <= innerTo;
      if (selectionInside) continue;
      decorations.push(
        Decoration.node(nested.pos, nested.pos + nested.node.nodeSize, {
          class: "tm-list-folded-hidden",
        }),
      );
    }
  }
  return decorations.length ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty;
}

function syncButtons(view: import("prosemirror-view").EditorView, locale: "fa" | "en"): void {
  const state = listFoldKey.getState(view.state);
  if (!state) return;
  for (const button of view.dom.querySelectorAll<HTMLButtonElement>(".tm-list-fold-toggle")) {
    const pos = Number(button.dataset.listFoldPos);
    const folded = state.folded.has(pos);
    button.setAttribute("aria-expanded", String(!folded));
    button.setAttribute(
      "aria-label",
      locale === "en"
        ? (folded ? "Expand child nodes" : "Collapse child nodes")
        : (folded ? "بازکردنِ زیرگره‌ها" : "بستنِ زیرگره‌ها"),
    );
  }
}

function mappedFolded(tr: Transaction, previous: Set<number>): Set<number> {
  if (!tr.docChanged) return previous;
  const next = new Set<number>();
  for (const pos of previous) {
    const mapped = tr.mapping.mapResult(pos, 1);
    if (!mapped.deleted && tr.doc.nodeAt(mapped.pos)?.type === schema.nodes.list_item) next.add(mapped.pos);
  }
  return next;
}

function mappedOpenedAt(tr: Transaction, previous: ReadonlyMap<number, number>): Map<number, number> {
  if (!tr.docChanged) return new Map(previous);
  const next = new Map<number, number>();
  for (const [pos, order] of previous) {
    const mapped = tr.mapping.mapResult(pos, 1);
    if (!mapped.deleted && tr.doc.nodeAt(mapped.pos)?.type === schema.nodes.list_item) next.set(mapped.pos, order);
  }
  return next;
}

function reconcileAccordion(doc: PMNode, folded: Set<number>, openedAt: ReadonlyMap<number, number>): void {
  const groups = new Map<number, Array<ReturnType<typeof foldableItems>[number]>>();
  for (const item of foldableItems(doc)) {
    const group = groups.get(item.parentPos) ?? [];
    group.push(item);
    groups.set(item.parentPos, group);
  }
  for (const siblings of groups.values()) {
    const expanded = siblings.filter((item) => !folded.has(item.pos));
    if (expanded.length <= 1) continue;
    let keep = expanded[0]!;
    for (const candidate of expanded.slice(1)) {
      if ((openedAt.get(candidate.pos) ?? -1) >= (openedAt.get(keep.pos) ?? -1)) keep = candidate;
    }
    for (const item of expanded) {
      if (item.pos !== keep.pos) folded.add(item.pos);
    }
  }
}

/** تاشدنِ هر list_item که یک فهرستِ تودرتو دارد؛ فقط Decoration است. */
export function listFoldPlugin(options: ListFoldOptions = {}): Plugin<ListFoldState> {
  const locale = options.locale ?? "fa";
  return new Plugin<ListFoldState>({
    key: listFoldKey,
    state: {
      init: (_config, state) => {
        const folded = new Set<number>(
          options.initial === "collapsed" ? foldableItems(state.doc).map((item) => item.pos) : [],
        );
        const mode = options.mode ?? "accordion";
        return { folded, mode, openedAt: new Map(), sequence: 0, decorations: buildDecorations(state, folded, locale) };
      },
      apply(tr, previous, _old, state) {
        const meta = tr.getMeta(listFoldKey) as ListFoldMeta | undefined;
        let folded = mappedFolded(tr, previous.folded);
        let mode = previous.mode;
        let openedAt = mappedOpenedAt(tr, previous.openedAt);
        let sequence = previous.sequence;
        if (meta) {
          folded = new Set(folded);
          if (meta.type === "toggle" && typeof meta.pos === "number") {
            if (folded.has(meta.pos)) {
              folded.delete(meta.pos);
              sequence += 1;
              openedAt.set(meta.pos, sequence);
              if (mode === "accordion") {
                const item = foldableItems(state.doc).find((candidate) => candidate.pos === meta.pos);
                if (item) {
                  for (const sibling of foldableItems(state.doc)) {
                    if (sibling.parentPos === item.parentPos && sibling.pos !== item.pos) folded.add(sibling.pos);
                  }
                }
              }
            }
            else folded.add(meta.pos);
          } else if (meta.type === "foldAll") {
            for (const item of foldableItems(state.doc)) folded.add(item.pos);
          } else if (meta.type === "unfoldAll") {
            folded.clear();
          } else if (meta.type === "setMode" && meta.mode) {
            mode = meta.mode;
            if (mode === "accordion") reconcileAccordion(state.doc, folded, openedAt);
          }
        } else if (!tr.docChanged && !tr.selectionSet) {
          return previous;
        }
        return { folded, mode, openedAt, sequence, decorations: buildDecorations(state, folded, locale) };
      },
    },
    view: (view) => ({ update: (next) => syncButtons(next, locale) }),
    props: {
      decorations: (state) => listFoldKey.getState(state)?.decorations ?? DecorationSet.empty,
      handleDOMEvents: {
        mousedown(view, event) {
          // کلیک معمولاً روی خودِ SVG یا path داخلِ دکمه فرود می‌آید؛
          // SVGElement از HTMLElement ارث نمی‌برد، اما Element است.
          const button =
            event.target instanceof Element
              ? event.target.closest<HTMLButtonElement>(".tm-list-fold-toggle")
              : null;
          if (!button) return false;
          const pos = Number(button.dataset.listFoldPos);
          if (!Number.isInteger(pos)) return false;
          event.preventDefault();
          const opening = listFoldKey.getState(view.state)?.folded.has(pos) ?? false;
          preserveScrollAnchor(
            () => view.dom.querySelector<HTMLElement>(`.tm-list-fold-toggle[data-list-fold-pos="${pos}"]`)?.closest(".tm-list-node") ?? null,
            () => {
              let tr = view.state.tr;
              if (!opening) {
                // ★ مکان‌نما باید به **پاراگرافِ خودِ بند** برود، نه داخلِ
                // زیرفهرست. `pos + 2` وسطِ همان زیرفهرستی می‌افتاد که قرار
                // است پنهان شود؛ آن‌گاه نگهبانِ `selectionInside` در
                // `buildDecorations` پنهان‌سازی را لغو می‌کرد و بستن هیچ اثری
                // نداشت — همان چیزی که کاربر در عکس نشان داد.
                const item = view.state.doc.nodeAt(pos);
                const firstChild = item?.firstChild;
                const inside =
                  firstChild && firstChild.type.name !== "bullet_list" && firstChild.type.name !== "ordered_list"
                    ? pos + 2
                    : pos;
                const selectionPos = Math.min(Math.max(inside, 0), view.state.doc.content.size);
                tr = tr.setSelection(Selection.near(view.state.doc.resolve(selectionPos), -1));
              }
              view.dispatch(tr.setMeta(listFoldKey, { type: "toggle", pos }));
            },
          );
          return true;
        },
      },
    },
  });
}

export const foldAllListNodes: Command = (state, dispatch) => {
  if (dispatch) {
    const pos = Math.min(1, state.doc.content.size);
    dispatch(
      state.tr
        .setSelection(Selection.near(state.doc.resolve(pos)))
        .setMeta(listFoldKey, { type: "foldAll" }),
    );
  }
  return true;
};

export const unfoldAllListNodes: Command = (state, dispatch) => {
  dispatch?.(state.tr.setMeta(listFoldKey, { type: "unfoldAll" }));
  return true;
};

export const setListFoldMode = (mode: "accordion" | "multiple"): Command => (state, dispatch) => {
  dispatch?.(state.tr.setMeta(listFoldKey, { type: "setMode", mode }));
  return true;
};
