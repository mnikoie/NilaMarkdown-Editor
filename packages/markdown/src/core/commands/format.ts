import { AllSelection } from "prosemirror-state";
import type { Command } from "prosemirror-state";
import { schema } from "../schema/index.js";

/** همهٔ قالب‌بندی‌های درون‌خطی را از انتخاب پاک می‌کند، بی حذفِ متن. */
export const clearFormatting: Command = (state, dispatch) => {
  const selection = state.selection;
  if (selection.empty) {
    if (!state.storedMarks?.length && !selection.$from.marks().length) return false;
    dispatch?.(state.tr.setStoredMarks([]));
    return true;
  }

  const tr = state.tr.removeMark(selection.from, selection.to);
  dispatch?.(tr);
  return true;
};

/** پاک‌کردن قالب‌بندیِ کل سند؛ برای مصرف‌کننده‌ای که انتخابِ صریح ندارد. */
export const clearAllFormatting: Command = (state, dispatch) => {
  const selection = new AllSelection(state.doc);
  dispatch?.(state.tr.setSelection(selection).removeMark(selection.from, selection.to));
  return true;
};

/** درجِ تصویرِ نشانی‌محور در مکان‌نما یا جای انتخاب. */
export function insertImage(src: string, alt = "تصویر", title: string | null = null): Command {
  return (state, dispatch) => {
    const clean = src.trim();
    if (!clean) return false;
    dispatch?.(
      state.tr
        .replaceSelectionWith(schema.nodes.image.create({ src: clean, alt: alt.trim() || null, title }))
        .scrollIntoView(),
    );
    return true;
  };
}
