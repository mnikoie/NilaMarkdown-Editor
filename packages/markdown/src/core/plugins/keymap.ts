import { keymap } from "prosemirror-keymap";
import {
  baseKeymap,
  toggleMark,
  setBlockType,
  chainCommands,
  exitCode,
} from "prosemirror-commands";
import { wrapInList, splitListItem, liftListItem, sinkListItem } from "prosemirror-schema-list";
import { undo, redo } from "prosemirror-history";
import { undoInputRule } from "prosemirror-inputrules";
import type { Plugin, Command } from "prosemirror-state";
import { schema } from "../schema/index.js";
import {
  addRowAfter,
  deleteRow,
  goToNextCell,
  insertTable,
  isInTable,
  moveColumnVisual,
} from "../commands/table.js";
import { toggleTaskList } from "../commands/task-list.js";
import { clearFormatting } from "../commands/format.js";
import { toggleFocusMode, toggleTypewriterMode } from "./writing-modes.js";
import {
  changeHeadingLevel,
  insertMathBlock,
  setParagraph,
  toggleBlockquote,
} from "../commands/paragraph.js";

/**
 * میان‌برها.
 *
 * `Mod-` یعنی Ctrl در ویندوز و لینوکس، Cmd در مک — خودِ prosemirror-keymap
 * تشخیص می‌دهد.
 */

/**
 * درجِ نیم‌فاصله با `Shift+Space`.
 *
 * ★ این برای فارسی حیاتی است. «می‌شود» با نیم‌فاصله و «می شود» با فاصله دو
 * چیزِ متفاوت‌اند، و روی کیبوردِ استانداردِ ویندوز راهِ راحتی برای تایپش
 * نیست. بی این، کاربر یا فاصلهٔ معمولی می‌زند (غلط) یا کپی-پیست می‌کند.
 */
const insertZWNJ: Command = (state, dispatch) => {
  dispatch?.(state.tr.insertText("‌").scrollIntoView());
  return true;
};

/** عنوانِ سطحِ `level`؛ اگر همان سطح بود، به پاراگراف برمی‌گردد. */
function toggleHeading(level: number): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const node = $from.parent;
    if (node.type === schema.nodes.heading && node.attrs.level === level) {
      return setBlockType(schema.nodes.paragraph)(state, dispatch);
    }
    return setBlockType(schema.nodes.heading, { level })(state, dispatch);
  };
}

export interface KeymapOptions {
  /** `Ctrl+/` — عوض‌کردنِ حالتِ سورس. لایهٔ React پیاده‌اش می‌کند. */
  onToggleSource?: () => void;
  /** `Ctrl+F` — بازکردنِ جست‌وجو. */
  onSearch?: () => void;
  /** `Ctrl+H` — بازکردنِ جایگزینی. */
  onReplace?: () => void;
  /** `Ctrl+K` — بازکردنِ ویرایشگرِ لینک. */
  onEditLink?: () => void;
  /** `Ctrl+Shift+L` — نمایش/پنهان‌کردنِ پنلِ ساختار. */
  onToggleOutline?: () => void;
  onActualSize?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

export function keymapPlugin(options: KeymapOptions = {}): Plugin {
  const keys: Record<string, Command> = {
    "Mod-z": undo,
    "Mod-y": redo,
    "Mod-Shift-z": redo,

    // Backspace اول قاعدهٔ ورودی را برمی‌گرداند: کاربری که `# ` زده و
    // پشیمان شده، انتظار دارد `# ` برگردد نه اینکه حرفِ قبلی پاک شود.
    Backspace: chainCommands(undoInputRule, baseKeymap.Backspace!),

    "Mod-b": toggleMark(schema.marks.strong),
    "Mod-i": toggleMark(schema.marks.em),
    "Mod-u": toggleMark(schema.marks.underline),
    "Mod-`": toggleMark(schema.marks.code),
    "Mod-Shift-`": toggleMark(schema.marks.code),
    "Alt-Shift-5": toggleMark(schema.marks.strike),
    "Mod-\\": clearFormatting,
    F8: toggleFocusMode,
    F9: toggleTypewriterMode,

    "Shift-Space": insertZWNJ,

    "Mod-Shift-8": wrapInList(schema.nodes.bullet_list),
    "Mod-Shift-7": wrapInList(schema.nodes.ordered_list),
    "Mod-Shift-x": toggleTaskList,
    "Mod-0": setParagraph,
    "Mod-=": changeHeadingLevel("increase"),
    "Mod--": changeHeadingLevel("decrease"),
    "Mod-t": insertTable(3, 3),
    "Mod-Shift-m": insertMathBlock(),
    "Mod-Shift-q": toggleBlockquote,
    "Alt-ArrowLeft": moveColumnVisual("left"),
    "Alt-ArrowRight": moveColumnVisual("right"),
    "Mod-Shift-Backspace": deleteRow,

    Enter: chainCommands(splitListItem(schema.nodes.list_item), baseKeymap.Enter!),
    "Mod-Enter": (state, dispatch) => (isInTable(state) ? addRowAfter(state, dispatch) : false),

    // Tab بسته به جا معنیِ متفاوت دارد: در جدول «سلولِ بعدی»، در فهرست
    // «تورفتگی». ترتیب مهم است — جدول اول چک می‌شود چون خاص‌تر است.
    Tab: chainCommands(
      (state, dispatch) => (isInTable(state) ? goToNextCell(1)(state, dispatch) : false),
      sinkListItem(schema.nodes.list_item),
    ),
    "Shift-Tab": chainCommands(
      (state, dispatch) => (isInTable(state) ? goToNextCell(-1)(state, dispatch) : false),
      liftListItem(schema.nodes.list_item),
    ),

    "Mod-Shift-k": setBlockType(schema.nodes.code_block),
    "Shift-Mod-\\": exitCode,
  };

  for (let i = 1; i <= 6; i++) {
    keys[`Mod-${i}`] = toggleHeading(i);
  }

  if (options.onSearch) {
    keys["Mod-f"] = () => {
      options.onSearch!();
      return true;
    };
  }

  if (options.onReplace) {
    keys["Mod-h"] = () => {
      options.onReplace!();
      return true;
    };
  }

  if (options.onToggleSource) {
    keys["Mod-/"] = () => {
      options.onToggleSource!();
      return true;
    };
  }

  if (options.onEditLink) {
    keys["Mod-k"] = () => {
      options.onEditLink!();
      return true;
    };
  }

  if (options.onToggleOutline) {
    keys["Mod-Shift-l"] = () => {
      options.onToggleOutline!();
      return true;
    };
  }

  if (options.onActualSize) keys["Mod-Shift-9"] = () => (options.onActualSize!(), true);
  if (options.onZoomIn) keys["Mod-Shift-="] = () => (options.onZoomIn!(), true);
  if (options.onZoomOut) keys["Mod-Shift--"] = () => (options.onZoomOut!(), true);

  return keymap(keys);
}

export { insertZWNJ, toggleHeading };
