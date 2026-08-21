import { Plugin, PluginKey } from "prosemirror-state";
import type { Command, EditorState, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../schema/index.js";

export interface ListFoldState {
  /** موقعیتِ list_itemهایی که زیرگره‌هایشان بسته است. */
  folded: Set<number>;
  decorations: DecorationSet;
}

interface ListFoldMeta {
  type: "toggle" | "foldAll" | "unfoldAll";
  pos?: number;
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

function foldableItems(doc: PMNode): Array<{ node: PMNode; pos: number; nested: ReturnType<typeof nestedLists> }> {
  const items: Array<{ node: PMNode; pos: number; nested: ReturnType<typeof nestedLists> }> = [];
  doc.descendants((node, pos) => {
    if (node.type !== schema.nodes.list_item) return true;
    const nested = nestedLists(node, pos);
    if (nested.length) items.push({ node, pos, nested });
    return true;
  });
  return items;
}

function buildDecorations(state: EditorState, folded: Set<number>): DecorationSet {
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
          button.setAttribute("aria-label", isFolded ? "بازکردنِ زیرگره‌ها" : "بستنِ زیرگره‌ها");
          button.setAttribute("aria-expanded", String(!isFolded));
          button.textContent = "⌄";
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
      const selectionInside =
        state.selection.from < nested.pos + nested.node.nodeSize && state.selection.to > nested.pos;
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

function syncButtons(view: import("prosemirror-view").EditorView): void {
  const state = listFoldKey.getState(view.state);
  if (!state) return;
  for (const button of view.dom.querySelectorAll<HTMLButtonElement>(".tm-list-fold-toggle")) {
    const pos = Number(button.dataset.listFoldPos);
    const folded = state.folded.has(pos);
    button.setAttribute("aria-expanded", String(!folded));
    button.setAttribute("aria-label", folded ? "بازکردنِ زیرگره‌ها" : "بستنِ زیرگره‌ها");
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

/** تاشدنِ هر list_item که یک فهرستِ تودرتو دارد؛ فقط Decoration است. */
export function listFoldPlugin(): Plugin<ListFoldState> {
  return new Plugin<ListFoldState>({
    key: listFoldKey,
    state: {
      init: (_config, state) => {
        const folded = new Set<number>();
        return { folded, decorations: buildDecorations(state, folded) };
      },
      apply(tr, previous, _old, state) {
        const meta = tr.getMeta(listFoldKey) as ListFoldMeta | undefined;
        let folded = mappedFolded(tr, previous.folded);
        if (meta) {
          folded = new Set(folded);
          if (meta.type === "toggle" && typeof meta.pos === "number") {
            if (folded.has(meta.pos)) folded.delete(meta.pos);
            else folded.add(meta.pos);
          } else if (meta.type === "foldAll") {
            for (const item of foldableItems(state.doc)) folded.add(item.pos);
          } else if (meta.type === "unfoldAll") {
            folded.clear();
          }
        } else if (!tr.docChanged && !tr.selectionSet) {
          return previous;
        }
        return { folded, decorations: buildDecorations(state, folded) };
      },
    },
    view: (view) => ({ update: (next) => syncButtons(next) }),
    props: {
      decorations: (state) => listFoldKey.getState(state)?.decorations ?? DecorationSet.empty,
      handleDOMEvents: {
        mousedown(view, event) {
          const button =
            event.target instanceof HTMLElement
              ? event.target.closest<HTMLButtonElement>(".tm-list-fold-toggle")
              : null;
          if (!button) return false;
          const pos = Number(button.dataset.listFoldPos);
          if (!Number.isInteger(pos)) return false;
          event.preventDefault();
          view.dispatch(view.state.tr.setMeta(listFoldKey, { type: "toggle", pos }));
          return true;
        },
      },
    },
  });
}

export const foldAllListNodes: Command = (state, dispatch) => {
  dispatch?.(state.tr.setMeta(listFoldKey, { type: "foldAll" }));
  return true;
};

export const unfoldAllListNodes: Command = (state, dispatch) => {
  dispatch?.(state.tr.setMeta(listFoldKey, { type: "unfoldAll" }));
  return true;
};
