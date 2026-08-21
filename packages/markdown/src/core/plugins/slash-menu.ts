import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Command } from "prosemirror-state";
import { Selection } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { setBlockType } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import { schema } from "../schema/index.js";
import { insertTable } from "../commands/table.js";
import { toggleTaskList } from "../commands/task-list.js";
import { BUILTIN_MARKS } from "../directives/builtin.js";
import type { MarkRegistry } from "../directives/types.js";
import { normalizeForSearch } from "./search.js";

/**
 * منوی `/` برای درجِ بلوک.
 *
 * ★ مارک‌های سفارشیِ کاربر خودکار در این منو می‌آیند — همان چیزی که
 * «مکانیزم عمومی است» یعنی. کاربری که مارکِ «تعریف» می‌سازد، بلافاصله
 * می‌تواند با `/تعریف` درجش کند بی اینکه کدی نوشته شود.
 */

export const slashKey = new PluginKey<SlashState>("tm-slash");

export interface SlashItem {
  id: string;
  label: string;
  /** واژه‌های دیگری که کاربر ممکن است تایپ کند. */
  keywords: string[];
  icon: string;
  group: string;
  run: Command;
}

export interface SlashState {
  /** منو باز است؟ */
  active: boolean;
  /** موقعیتِ خودِ `/` در سند. */
  from: number;
  /** متنی که بعدِ `/` تایپ شده. */
  query: string;
  items: SlashItem[];
  selected: number;
  decorations: DecorationSet;
}

const CLOSED: SlashState = {
  active: false,
  from: -1,
  query: "",
  items: [],
  selected: 0,
  decorations: DecorationSet.empty,
};

/** بلوک‌های پایه — همیشه هستند. */
function baseItems(): SlashItem[] {
  const heading = (level: number): SlashItem => ({
    id: `h${level}`,
    label: `عنوانِ ${level}`,
    keywords: ["heading", "عنوان", "تیتر", `h${level}`],
    icon: `H${level}`,
    group: "متن",
    run: setBlockType(schema.nodes.heading, { level }),
  });

  return [
    heading(1),
    heading(2),
    heading(3),
    heading(4),
    heading(5),
    heading(6),
    {
      id: "ul",
      label: "فهرستِ نقطه‌ای",
      keywords: ["list", "فهرست", "لیست", "bullet"],
      icon: "•",
      group: "فهرست",
      run: wrapInList(schema.nodes.bullet_list),
    },
    {
      id: "ol",
      label: "فهرستِ شماره‌دار",
      keywords: ["ordered", "شماره", "عددی", "number"],
      icon: "۱.",
      group: "فهرست",
      run: wrapInList(schema.nodes.ordered_list),
    },
    {
      id: "task",
      label: "چک‌لیست",
      keywords: ["task", "check", "کار", "وظیفه", "چک"],
      icon: "☑",
      group: "فهرست",
      run: toggleTaskList,
    },
    {
      id: "quote",
      label: "نقلِ قول",
      keywords: ["quote", "نقل", "قول", "blockquote"],
      icon: "❝",
      group: "بلوک",
      run: (state, dispatch) => {
        const range = state.selection.$from.blockRange();
        if (!range) return false;
        dispatch?.(state.tr.wrap(range, [{ type: schema.nodes.blockquote }]));
        return true;
      },
    },
    {
      id: "code",
      label: "بلوکِ کد",
      keywords: ["code", "کد", "برنامه"],
      icon: "{}",
      group: "بلوک",
      run: setBlockType(schema.nodes.code_block),
    },
    {
      id: "table",
      label: "جدول",
      keywords: ["table", "جدول"],
      icon: "▦",
      group: "بلوک",
      run: insertTable(3, 3),
    },
    {
      id: "hr",
      label: "جداکننده",
      keywords: ["divider", "جدا", "خط", "rule"],
      icon: "—",
      group: "بلوک",
      run: (state, dispatch) => {
        dispatch?.(state.tr.replaceSelectionWith(schema.nodes.horizontal_rule.create()));
        return true;
      },
    },
    {
      id: "math",
      label: "فرمولِ ریاضی",
      keywords: ["math", "ریاضی", "فرمول", "latex"],
      icon: "∑",
      group: "بلوک",
      run: (state, dispatch) => {
        dispatch?.(state.tr.replaceSelectionWith(schema.nodes.math_block.create({ value: "" })));
        return true;
      },
    },
  ];
}

/** مارک‌های سفارشی — خودکار از registry. */
function markItems(registry: MarkRegistry): SlashItem[] {
  return Object.values(registry)
    .filter((def) => def.kind === "بلوکی" && def.inSlashMenu !== false)
    .map((def) => ({
      id: `mark-${def.name}`,
      label: def.label ?? def.name,
      keywords: [def.name, def.label ?? def.name],
      icon: def.icon ?? "◆",
      group: "مارک‌ها",
      run: ((state, dispatch) => {
        const node = schema.nodes.directive_block.create(
          { name: def.name, attributes: {}, label: null },
          schema.nodes.paragraph.create(),
        );
        dispatch?.(state.tr.replaceSelectionWith(node).scrollIntoView());
        return true;
      }) as Command,
    }));
}

export function allSlashItems(registry: MarkRegistry = BUILTIN_MARKS): SlashItem[] {
  return [...baseItems(), ...markItems(registry)];
}

/**
 * فیلترِ آیتم‌ها.
 *
 * از همان نرمال‌سازیِ جست‌وجو استفاده می‌کند تا `/نکته` و `/نكته` هر دو
 * کار کنند.
 */
export function filterItems(items: SlashItem[], query: string): SlashItem[] {
  if (!query) return items;
  const q = normalizeForSearch(query.toLowerCase());
  return items.filter((item) =>
    [item.label, ...item.keywords].some((k) =>
      normalizeForSearch(k.toLowerCase()).includes(q),
    ),
  );
}

export interface SlashOptions {
  registry?: MarkRegistry;
}

export function slashMenuPlugin(options: SlashOptions = {}): Plugin<SlashState> {
  const registry = options.registry ?? BUILTIN_MARKS;
  const items = allSlashItems(registry);

  return new Plugin<SlashState>({
    key: slashKey,

    state: {
      init: () => CLOSED,

      apply(tr, prev, _old, newState) {
        const meta = tr.getMeta(slashKey) as { type: string; index?: number } | undefined;

        if (meta?.type === "close") return CLOSED;
        if (meta?.type === "move" && prev.active) {
          const filtered = prev.items;
          if (filtered.length === 0) return prev;
          const selected =
            (prev.selected + (meta.index ?? 0) + filtered.length) % filtered.length;
          return { ...prev, selected };
        }

        // منو با تایپِ `/` در ابتدای یک بلوکِ خالی یا بعد از فاصله باز
        // می‌شود — نه وسطِ کلمه، وگرنه هر `/` در نشانی منو باز می‌کند.
        const { $from, empty } = newState.selection;
        if (!empty || !$from.parent.isTextblock || $from.parent.type.name === "code_block") {
          return prev.active ? CLOSED : prev;
        }

        const textBefore = $from.parent.textBetween(
          Math.max(0, $from.parentOffset - 60),
          $from.parentOffset,
          undefined,
          "￼",
        );

        const match = /(?:^|\s)\/([^\s/]*)$/.exec(textBefore);
        if (!match) return prev.active ? CLOSED : prev;

        const query = match[1] ?? "";
        const from = $from.pos - query.length - 1;
        const filtered = filterItems(items, query);

        return {
          active: true,
          from,
          query,
          items: filtered,
          // با عوض‌شدنِ عبارت، انتخاب به اول برمی‌گردد.
          selected: query === prev.query ? Math.min(prev.selected, Math.max(0, filtered.length - 1)) : 0,
          decorations: DecorationSet.create(newState.doc, [
            Decoration.inline(from, $from.pos, { class: "tm-slash-query" }),
          ]),
        };
      },
    },

    props: {
      decorations: (state) => slashKey.getState(state)?.decorations ?? DecorationSet.empty,

      handleKeyDown(view, event) {
        const s = slashKey.getState(view.state);
        if (!s?.active) return false;

        switch (event.key) {
          case "ArrowDown":
            view.dispatch(view.state.tr.setMeta(slashKey, { type: "move", index: 1 }));
            return true;
          case "ArrowUp":
            view.dispatch(view.state.tr.setMeta(slashKey, { type: "move", index: -1 }));
            return true;
          case "Enter":
          case "Tab": {
            const item = s.items[s.selected];
            if (!item) return false;
            runSlashItem(view.state, view.dispatch, item, s);
            return true;
          }
          case "Escape":
            view.dispatch(view.state.tr.setMeta(slashKey, { type: "close" }));
            return true;
          default:
            return false;
        }
      },
    },
  });
}

/**
 * آیتم را اجرا می‌کند و متنِ `/…` را پاک.
 *
 * ★ هر دو کار در **یک تراکنش** — وگرنه undo دو قدم می‌شود و کاربر
 * می‌بیند که `/جدول` برمی‌گردد.
 */
export function runSlashItem(
  state: EditorState,
  dispatch: ((tr: import("prosemirror-state").Transaction) => void) | undefined,
  item: SlashItem,
  slashState: SlashState,
): boolean {
  if (!dispatch) return true;

  // ★ هر دو کار باید در **یک تراکنش** باشند، وگرنه undo دو قدم می‌شود و
  // کاربر با یک Ctrl+Z می‌بیند که `/جدول` برمی‌گردد.
  //
  // ★★ ولی نمی‌شود step‌های فرمان را از یک حالتِ *مشتق* برداشت و روی
  // تراکنشِ اصلی سوار کرد: فرمان‌هایی مثل `replaceSelectionWith` به
  // `state.selection` نگاه می‌کنند، و آن انتخاب مالِ حالتِ مشتق است نه
  // تراکنشِ ما. نتیجه‌اش را در مرورگر دیدم — جدول فقط ۱ بار از ۶ درج
  // می‌شد و بقیه بی‌صدا گم می‌شد.
  //
  // راهِ درست: حالتِ پاک‌شده را بساز، فرمان را همان‌جا اجرا کن، و
  // تراکنشِ **خودِ فرمان** را با تاریخچهٔ ادغام‌شده dispatch کن.
  // `appendTransaction`‌وار عمل نمی‌کنیم چون undo باید یکی بماند؛
  // به‌جایش تراکنشِ دوم را با `addToHistory: false` می‌فرستیم تا با
  // قبلی در یک قدم جمع شود.
  // راهِ درست: حالتِ پاک‌شده را بساز و فرمان را همان‌جا اجرا کن — تا
  // `state.selection`ی که فرمان می‌بیند درست باشد. بعد **همهٔ** step‌ها
  // (حذف + فرمان) در یک تراکنشِ تازه از حالتِ اصلی جمع می‌شوند.
  //
  // چون هر دو دسته step از یک زنجیرهٔ پیوسته‌اند (فرمان روی نتیجهٔ حذف
  // اجرا شده)، سوارکردنشان روی یک تراکنش معتبر است و موقعیت‌ها می‌خوانند.
  const deleteTr = state.tr.delete(slashState.from, state.selection.from);
  const cleaned = state.apply(deleteTr);

  let commandTr: import("prosemirror-state").Transaction | null = null;
  item.run(cleaned, (t) => {
    commandTr = t;
  });

  // فرمانی که اجرا نشد (مثلاً setBlockType در جای نامعتبر) نباید سند را
  // با یک حذفِ نیمه‌کاره رها کند.
  if (!commandTr) return false;

  const merged = state.tr;
  for (const step of deleteTr.steps) merged.step(step);
  for (const step of (commandTr as import("prosemirror-state").Transaction).steps) {
    merged.step(step);
  }

  // انتخابِ نهایی را از تراکنشِ فرمان برمی‌داریم و روی سندِ نهایی
  // دوباره حل می‌کنیم — سندِ هر دو یکی است، پس موقعیت معتبر است.
  const finalSelection = (commandTr as import("prosemirror-state").Transaction).selection;
  merged.setSelection(
    Selection.near(merged.doc.resolve(Math.min(finalSelection.from, merged.doc.content.size))),
  );

  merged.setMeta(slashKey, { type: "close" });
  dispatch(merged.scrollIntoView());
  return true;
}

export const getSlashState = (state: EditorState): SlashState =>
  slashKey.getState(state) ?? CLOSED;

export const closeSlashMenu: Command = (state, dispatch) => {
  dispatch?.(state.tr.setMeta(slashKey, { type: "close" }));
  return true;
};
