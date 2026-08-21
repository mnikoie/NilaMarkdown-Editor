import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Command } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

/**
 * حالتِ تمرکز و حالتِ ماشین‌تحریر.
 *
 * - **تمرکز:** بلوکِ فعال پررنگ، بقیه کم‌رنگ.
 * - **ماشین‌تحریر:** خطِ فعال همیشه وسطِ صفحه می‌ماند.
 *
 * ★ هر دو فقط **نمایش**اند — نه سند عوض می‌شود نه تاریخچه. مثلِ تاشدن،
 * `Decoration` کافی است.
 */

export const writingModesKey = new PluginKey<WritingModesState>("tm-writing-modes");

export interface WritingModesState {
  focus: boolean;
  typewriter: boolean;
  decorations: DecorationSet;
}

export interface WritingModesOptions {
  focus?: boolean;
  typewriter?: boolean;
}

function build(state: EditorState, focus: boolean): DecorationSet {
  if (!focus) return DecorationSet.empty;

  const { $from } = state.selection;
  // بلوکِ سطحِ اولی که مکان‌نما داخلش است — نه عمیق‌ترین گره، وگرنه
  // در فهرست فقط یک آیتم روشن می‌ماند و بقیه کم‌رنگ که ناخوشایند است.
  const activeDepth = $from.depth > 0 ? 1 : 0;
  const activeFrom = activeDepth > 0 ? $from.before(activeDepth) : -1;

  const decos: Decoration[] = [];
  state.doc.forEach((node, offset) => {
    if (offset !== activeFrom) {
      decos.push(
        Decoration.node(offset, offset + node.nodeSize, { class: "tm-dimmed" }),
      );
    }
  });

  return decos.length > 0 ? DecorationSet.create(state.doc, decos) : DecorationSet.empty;
}

interface Meta {
  focus?: boolean;
  typewriter?: boolean;
}

export function writingModesPlugin(options: WritingModesOptions = {}): Plugin<WritingModesState> {
  return new Plugin<WritingModesState>({
    key: writingModesKey,

    state: {
      init(_config, state) {
        const focus = options.focus ?? false;
        return {
          focus,
          typewriter: options.typewriter ?? false,
          decorations: build(state, focus),
        };
      },

      apply(tr, prev, _old, newState) {
        const meta = tr.getMeta(writingModesKey) as Meta | undefined;
        const focus = meta?.focus ?? prev.focus;
        const typewriter = meta?.typewriter ?? prev.typewriter;

        if (!meta && !tr.docChanged && !tr.selectionSet) return prev;

        return { focus, typewriter, decorations: build(newState, focus) };
      },
    },

    props: {
      decorations: (state) =>
        writingModesKey.getState(state)?.decorations ?? DecorationSet.empty,

      attributes(state): Record<string, string> {
        const s = writingModesKey.getState(state);
        const classes: string[] = [];
        if (s?.focus) classes.push("tm-focus-mode");
        if (s?.typewriter) classes.push("tm-typewriter-mode");
        // شیءِ خالی و نه `{ class: undefined }` — ProseMirror نگاشتِ
        // رشته‌به‌رشته می‌خواهد.
        return classes.length > 0 ? { class: classes.join(" ") } : {};
      },
    },

    view(view) {
      /**
       * ماشین‌تحریر: بعد از هر تغییرِ انتخاب، خطِ فعال را وسط می‌آورد.
       *
       * ★ `scrollIntoView` معمولی کافی نیست — آن فقط تضمین می‌کند خط
       * *دیده* شود، نه اینکه وسط باشد. پس خودمان حساب می‌کنیم.
       */
      let lastPos = -1;

      const center = () => {
        const s = writingModesKey.getState(view.state);
        if (!s?.typewriter) return;

        const pos = view.state.selection.head;
        if (pos === lastPos) return;
        lastPos = pos;

        try {
          const coords = view.coordsAtPos(pos);
          const scroller = findScroller(view.dom);
          if (!scroller) return;

          const box = scroller.getBoundingClientRect();
          const target = box.top + box.height / 2;
          const delta = coords.top - target;
          if (Math.abs(delta) > 4) scroller.scrollTop += delta;
        } catch {
          // موقعیت هنوز در DOM نیست — دفعهٔ بعد.
        }
      };

      return {
        update: center,
      };
    },
  });
}

/** نزدیک‌ترین عنصری که واقعاً اسکرول می‌شود. */
function findScroller(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node) {
    const style = getComputedStyle(node);
    if (/auto|scroll|overlay/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement as HTMLElement | null;
}

/* ── فرمان‌ها ── */

export const toggleFocusMode: Command = (state, dispatch) => {
  const s = writingModesKey.getState(state);
  dispatch?.(state.tr.setMeta(writingModesKey, { focus: !s?.focus }));
  return true;
};

export const toggleTypewriterMode: Command = (state, dispatch) => {
  const s = writingModesKey.getState(state);
  dispatch?.(state.tr.setMeta(writingModesKey, { typewriter: !s?.typewriter }));
  return true;
};

export const getWritingModes = (state: EditorState): WritingModesState =>
  writingModesKey.getState(state) ?? {
    focus: false,
    typewriter: false,
    decorations: DecorationSet.empty,
  };
