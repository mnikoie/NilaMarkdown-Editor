import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

export const emojiKey = new PluginKey<DecorationSet>("tm-emoji-shortnames");

/** مجموعه کوچک و پایدار از نام‌های رایج؛ سورس Markdown هرگز تغییر نمی‌کند. */
export const EMOJI_SHORTNAMES: Readonly<Record<string, string>> = {
  smile: "😄", grin: "😁", joy: "😂", wink: "😉", heart: "❤️", broken_heart: "💔",
  thumbs_up: "👍", "+1": "👍", thumbs_down: "👎", "-1": "👎", clap: "👏", pray: "🙏",
  wave: "👋", ok_hand: "👌", muscle: "💪", eyes: "👀", thinking: "🤔", fire: "🔥",
  rocket: "🚀", tada: "🎉", warning: "⚠️", bulb: "💡", memo: "📝", book: "📖",
  link: "🔗", lock: "🔒", unlock: "🔓", key: "🔑", check: "✅", x: "❌",
  star: "⭐", sparkles: "✨", info: "ℹ️", question: "❓", exclamation: "❗",
  iran: "🇮🇷", globe_with_meridians: "🌐", calendar: "📅", clock: "🕐",
};

function decorations(doc: import("prosemirror-model").Node, selection: { from: number; to: number }) {
  const out: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    for (const match of node.text.matchAll(/:([a-z0-9_+-]+):/gi)) {
      const emoji = EMOJI_SHORTNAMES[match[1]!.toLowerCase()];
      if (!emoji || match.index == null) continue;
      const from = pos + match.index;
      const to = from + match[0].length;
      if (selection.from <= to && selection.to >= from) continue;
      out.push(Decoration.inline(from, to, { class: "tm-emoji-source", "aria-hidden": "true" }));
      out.push(Decoration.widget(from, () => {
        const span = document.createElement("span");
        span.className = "tm-emoji-shortname";
        span.textContent = emoji;
        span.title = match[0];
        span.setAttribute("aria-label", match[0]);
        span.contentEditable = "false";
        return span;
      }, { side: -1 }));
    }
    return true;
  });
  return DecorationSet.create(doc, out);
}

export function emojiShortnamePlugin(): Plugin<DecorationSet> {
  return new Plugin({
    key: emojiKey,
    state: {
      init: (_, state) => decorations(state.doc, state.selection),
      apply: (tr, previous, _old, state) => tr.docChanged || tr.selectionSet
        ? decorations(state.doc, state.selection)
        : previous,
    },
    props: { decorations: (state) => emojiKey.getState(state) },
  });
}
