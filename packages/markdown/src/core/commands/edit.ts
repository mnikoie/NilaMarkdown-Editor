import { TextSelection } from "prosemirror-state";
import type { Command, EditorState } from "prosemirror-state";
import { schema } from "../schema/index.js";
import { serialize } from "../markdown/serialize.js";

/** متنِ سادهٔ انتخاب؛ انتخابِ خالی عمداً چیزی برنمی‌گرداند. */
export function selectedText(state: EditorState): string {
  const { from, to, empty } = state.selection;
  return empty ? "" : state.doc.textBetween(from, to, "\n");
}

/**
 * Markdown انتخاب را برای «Copy as Markdown» می‌سازد.
 *
 * انتخابِ درونِ یک پاراگراف با مارک‌هایش سریالایز می‌شود. برای انتخاب‌های
 * چندبلوکی نیز اگر Fragment در ریشهٔ سند معتبر باشد همان ساختار حفظ می‌شود؛
 * انتخاب‌های نیمه‌بازِ پیچیده به متنِ ساده برمی‌گردند تا هیچ محتوایی گم نشود.
 */
export function selectedMarkdown(state: EditorState): string {
  if (state.selection.empty) return "";
  const slice = state.selection.content();

  try {
    if (schema.nodes.doc.validContent(slice.content)) {
      return serialize(schema.nodes.doc.create(null, slice.content)).replace(/\n$/, "");
    }

    if (slice.content.childCount && slice.content.firstChild?.isText) {
      const paragraph = schema.nodes.paragraph.create(null, slice.content);
      return serialize(schema.nodes.doc.create(null, paragraph)).replace(/\n$/, "");
    }
  } catch {
    // Fragmentهای نیمه‌باز ممکن است بیرون از والدشان معتبر نباشند.
  }

  return selectedText(state);
}

function currentBlock(state: EditorState) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (!node.isBlock) continue;
    return {
      node,
      depth,
      parent: $from.node(depth - 1),
      index: $from.index(depth - 1),
      from: $from.before(depth),
      to: $from.after(depth),
    };
  }
  return null;
}

/** انتخاب یا بلوکِ جاری را در یک قدمِ undo تکثیر می‌کند. */
export const duplicateSelectionOrBlock: Command = (state, dispatch) => {
  const { selection } = state;
  if (!selection.empty) {
    const slice = selection.content();
    if (!dispatch) return true;
    const tr = state.tr.replaceRange(selection.to, selection.to, slice);
    dispatch(tr.scrollIntoView());
    return true;
  }

  const block = currentBlock(state);
  if (!block || !block.parent.canReplaceWith(block.index + 1, block.index + 1, block.node.type)) {
    return false;
  }
  if (!dispatch) return true;

  const offset = state.selection.from - block.from;
  const tr = state.tr.insert(block.to, block.node.copy(block.node.content));
  const cursor = Math.min(block.to + offset, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(cursor), 1));
  dispatch(tr.scrollIntoView());
  return true;
};

/** انتخاب یا بلوکِ جاری را حذف می‌کند و سند را همیشه معتبر نگه می‌دارد. */
export const deleteSelectionOrBlock: Command = (state, dispatch) => {
  if (!state.selection.empty) {
    if (!dispatch) return true;
    dispatch(state.tr.deleteSelection().scrollIntoView());
    return true;
  }

  const block = currentBlock(state);
  if (!block) return false;
  if (!dispatch) return true;

  const tr =
    block.parent.childCount === 1
      ? state.tr.replaceWith(block.from, block.to, schema.nodes.paragraph.create())
      : state.tr.delete(block.from, block.to);
  const cursor = Math.min(block.from + 1, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(cursor), 1));
  dispatch(tr.scrollIntoView());
  return true;
};
