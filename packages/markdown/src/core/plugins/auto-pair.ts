import { Plugin } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";

export interface AutoPairOptions {
  brackets?: boolean;
  quotes?: boolean;
}

const BRACKETS: Record<string, string> = { "[": "]", "(": ")", "{": "}" };
const CLOSERS = new Set(Object.values(BRACKETS));

/**
 * جفت‌کردنِ نشانه‌های رایج هنگامِ تایپ.
 *
 * این فقط رفتارِ ورودی است؛ نویسهٔ ساختگی واردِ Decoration نمی‌شود و
 * نتیجه مثلِ متنِ عادی در Markdown ذخیره می‌شود.
 */
export function autoPairPlugin(options: AutoPairOptions = {}): Plugin {
  const brackets = options.brackets !== false;
  const quotes = options.quotes !== false;

  return new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        const { state } = view;
        if (state.selection.$from.parent.type.spec.code) return false;

        const next = state.doc.textBetween(from, Math.min(from + 1, state.doc.content.size), "");
        if ((CLOSERS.has(text) || (quotes && (text === '"' || text === "'"))) && next === text) {
          view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from + 1)));
          return true;
        }

        const close = brackets ? BRACKETS[text] : undefined;
        const quoteClose = quotes && (text === '"' || text === "'") ? text : undefined;
        const pair = close ?? quoteClose;
        if (!pair) return false;

        const selected = state.doc.textBetween(from, to, "");
        const inserted = `${text}${selected}${pair}`;
        const tr = state.tr.insertText(inserted, from, to);
        const cursor = selected ? from + inserted.length : from + text.length;
        tr.setSelection(TextSelection.create(tr.doc, cursor));
        view.dispatch(tr);
        return true;
      },
    },
  });
}
