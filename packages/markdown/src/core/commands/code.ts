import { TextSelection } from "prosemirror-state";
import type { Command } from "prosemirror-state";
import { schema } from "../schema/index.js";

function codeBlock(state: Parameters<Command>[0]): { depth: number; from: number; text: string } | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type === schema.nodes.code_block) {
      return { depth, from: $from.start(depth), text: node.textContent };
    }
  }
  return null;
}

/**
 * مرتب‌سازیِ عمومیِ تورفتگیِ کد، بی formatter زبان‌محور:
 * tabها را یکدست، فاصلهٔ انتهای خط را حذف و تورفتگیِ مشترک را کم می‌کند.
 */
export function autoIndentCode(scope: "selection" | "block" = "block"): Command {
  return (state, dispatch) => {
    const block = codeBlock(state);
    if (!block) return false;

    let start = 0;
    let end = block.text.length;
    if (scope === "selection" && !state.selection.empty) {
      start = Math.max(0, state.selection.from - block.from);
      end = Math.min(block.text.length, state.selection.to - block.from);
      start = block.text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const lineEnd = block.text.indexOf("\n", end);
      end = lineEnd < 0 ? block.text.length : lineEnd;
    }

    const source = block.text.slice(start, end).replace(/\t/g, "  ");
    const lines = source.split("\n").map((line) => line.replace(/[ \t]+$/g, ""));
    const indents = lines
      .filter((line) => line.trim())
      .map((line) => /^ */.exec(line)?.[0].length ?? 0);
    const common = indents.length ? Math.min(...indents) : 0;
    const formatted = lines.map((line) => (line.trim() ? line.slice(common) : "")).join("\n");
    if (formatted === block.text.slice(start, end)) return true;
    if (!dispatch) return true;

    const from = block.from + start;
    const tr = state.tr.insertText(formatted, from, block.from + end);
    tr.setSelection(TextSelection.create(tr.doc, from, from + formatted.length));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export function codeContent(state: Parameters<Command>[0]): string | null {
  return codeBlock(state)?.text ?? null;
}
