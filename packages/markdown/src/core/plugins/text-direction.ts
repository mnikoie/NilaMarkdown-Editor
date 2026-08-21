import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

export type TextDirection = "auto" | "rtl" | "ltr";

export const textDirectionKey = new PluginKey<DecorationSet>("tm-text-direction");

const RTL = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
const LTR = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]/u;
const LETTER = /\p{L}/u;

/** جهتِ اولین نویسهٔ قوی؛ عدد و نشانه جهتِ پاراگراف را تعیین نمی‌کند. */
export function detectTextDirection(text: string): "rtl" | "ltr" | null {
  for (const char of text) {
    if (!LETTER.test(char)) continue;
    if (RTL.test(char)) return "rtl";
    if (LTR.test(char)) return "ltr";
  }
  return null;
}

function decorations(state: EditorState, direction: TextDirection): DecorationSet {
  const result: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const dir = direction === "auto" ? detectTextDirection(node.textContent) : direction;
    if (dir) {
      result.push(
        Decoration.node(pos, pos + node.nodeSize, {
          dir,
          "data-auto-dir": direction === "auto" ? "true" : "false",
        }),
      );
    }
    return false;
  });
  return result.length ? DecorationSet.create(state.doc, result) : DecorationSet.empty;
}

/** جهت فقط Decoration است و هیچ صفتی وارد Markdown نمی‌کند. */
export function textDirectionPlugin(direction: TextDirection = "auto"): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: textDirectionKey,
    state: {
      init: (_config, state) => decorations(state, direction),
      apply: (tr, previous, _old, state) => (tr.docChanged ? decorations(state, direction) : previous),
    },
    props: {
      decorations: (state) => textDirectionKey.getState(state) ?? DecorationSet.empty,
    },
  });
}
