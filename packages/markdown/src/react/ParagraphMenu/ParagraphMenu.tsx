"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ChevronDown, ChevronLeft, Pilcrow } from "lucide-react";
import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { setBlockType } from "prosemirror-commands";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  currentTable,
  deleteColumn,
  deleteRow,
  deleteTable,
  insertTable,
  moveColumnVisual,
  moveRow,
} from "../../core/commands/table.js";
import {
  changeHeadingLevel,
  indentListItem,
  insertAlert,
  insertFootnote,
  insertHorizontalRule,
  insertMathBlock,
  insertParagraphAfter,
  insertParagraphBefore,
  insertTableOfContents,
  insertYamlFrontMatter,
  outdentListItem,
  setParagraph,
  toggleBlockquote,
  toggleBulletList,
  toggleOrderedList,
} from "../../core/commands/paragraph.js";
import { autoIndentCode, codeContent } from "../../core/commands/code.js";
import { setTaskStatus, toggleTaskList } from "../../core/commands/task-list.js";
import { foldAllListNodes, unfoldAllListNodes } from "../../core/plugins/list-fold.js";
import { schema } from "../../core/schema/index.js";
import { serialize } from "../../core/markdown/serialize.js";
import { useMarkdownI18n } from "../i18n.js";

export interface ParagraphMenuProps {
  view: EditorView | null;
  onInsertReferenceLink?: () => void;
  onNotice?: (message: string) => void;
}

interface Action {
  id: string;
  label: string;
  shortcut?: string;
  command?: Command;
  run?: (view: EditorView) => void | Promise<void>;
  separatorBefore?: boolean;
  disabledHint?: string;
}

interface Submenu {
  id: string;
  label: string;
  items: Action[];
  separatorBefore?: boolean;
}

type Entry = Action | Submenu;

function isSubmenu(entry: Entry): entry is Submenu {
  return "items" in entry;
}

async function copyText(text: string, onNotice?: (message: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    onNotice?.("کپی شد.");
  } catch {
    onNotice?.("دسترسی به کلیپ‌بورد ممکن نشد.");
  }
}

function entries(onReference?: () => void, onNotice?: (message: string) => void): Entry[] {
  const headings: Action[] = Array.from({ length: 6 }, (_, index) => ({
    id: `heading-${index + 1}`,
    label: `عنوان ${index + 1}`,
    shortcut: `Ctrl+${index + 1}`,
    command: setBlockType(schema.nodes.heading, { level: index + 1 }),
  }));

  return [
    ...headings,
    { id: "paragraph", label: "پاراگراف", shortcut: "Ctrl+0", command: setParagraph, separatorBefore: true },
    {
      id: "heading-up",
      label: "افزایش سطح عنوان",
      shortcut: "Ctrl+=",
      command: changeHeadingLevel("increase"),
      separatorBefore: true,
    },
    {
      id: "heading-down",
      label: "کاهش سطح عنوان",
      shortcut: "Ctrl+-",
      command: changeHeadingLevel("decrease"),
    },
    {
      id: "table-menu",
      label: "جدول",
      separatorBefore: true,
      items: [
        { id: "table-insert", label: "درج جدول", shortcut: "Ctrl+T", command: insertTable(3, 3) },
        { id: "row-before", label: "افزودن ردیف قبل", command: addRowBefore, separatorBefore: true },
        { id: "row-after", label: "افزودن ردیف بعد", shortcut: "Ctrl+Enter", command: addRowAfter },
        { id: "col-before", label: "افزودن ستون قبل", command: addColumnBefore, separatorBefore: true },
        { id: "col-after", label: "افزودن ستون بعد", command: addColumnAfter },
        { id: "row-up", label: "انتقال ردیف به بالا", command: moveRow(-1), separatorBefore: true },
        { id: "row-down", label: "انتقال ردیف به پایین", command: moveRow(1) },
        { id: "col-left", label: "انتقال ستون به چپ", shortcut: "Alt+←", command: moveColumnVisual("left") },
        { id: "col-right", label: "انتقال ستون به راست", shortcut: "Alt+→", command: moveColumnVisual("right") },
        { id: "row-delete", label: "حذف ردیف", command: deleteRow, separatorBefore: true },
        { id: "col-delete", label: "حذف ستون", command: deleteColumn },
        {
          id: "table-copy",
          label: "کپی جدول",
          separatorBefore: true,
          run: async (view) => {
            const table = currentTable(view.state);
            if (!table) return;
            const doc = schema.nodes.doc.create(null, [table, schema.nodes.paragraph.create()]);
            await copyText(serialize(doc).trim(), onNotice);
          },
        },
        {
          id: "table-pretty",
          label: "مرتب‌سازی منبع جدول",
          run: () => onNotice?.("جدول ساختاری است و منبع آن هنگام ذخیره خودکار مرتب می‌شود."),
        },
        { id: "table-delete", label: "حذف جدول", command: deleteTable, separatorBefore: true },
      ],
    },
    { id: "math", label: "بلوک ریاضی", shortcut: "Ctrl+Shift+M", command: insertMathBlock() },
    {
      id: "code-block",
      label: "بلوک کد",
      shortcut: "Ctrl+Shift+K",
      command: setBlockType(schema.nodes.code_block),
    },
    {
      id: "code-tools",
      label: "ابزارهای کد",
      items: [
        {
          id: "code-copy",
          label: "کپی محتوای کد",
          run: async (view) => {
            const text = codeContent(view.state);
            if (text !== null) await copyText(text, onNotice);
          },
        },
        { id: "code-indent-selection", label: "مرتب‌سازی کد انتخاب‌شده", command: autoIndentCode("selection") },
        { id: "code-indent-all", label: "مرتب‌سازی کل بلوک کد", command: autoIndentCode("block") },
      ],
    },
    {
      id: "alerts",
      label: "هشدارها",
      items: [
        { id: "alert-note", label: "یادداشت (Note)", command: insertAlert("note") },
        { id: "alert-tip", label: "نکته (Tip)", command: insertAlert("tip") },
        { id: "alert-important", label: "مهم (Important)", command: insertAlert("important") },
        { id: "alert-warning", label: "هشدار (Warning)", command: insertAlert("warning") },
        { id: "alert-caution", label: "احتیاط (Caution)", command: insertAlert("caution") },
      ],
    },
    {
      id: "quote",
      label: "نقل‌قول",
      shortcut: "Ctrl+Shift+Q",
      command: toggleBlockquote,
      separatorBefore: true,
    },
    { id: "ordered", label: "فهرست شماره‌دار", command: toggleOrderedList, separatorBefore: true },
    { id: "bullet", label: "فهرست نقطه‌ای", command: toggleBulletList },
    { id: "task", label: "فهرست وظایف", shortcut: "Ctrl+Shift+X", command: toggleTaskList },
    {
      id: "task-status",
      label: "وضعیت وظیفه",
      items: [
        { id: "task-toggle", label: "تغییر وضعیت", command: setTaskStatus("toggle") },
        { id: "task-complete", label: "علامت‌گذاری به‌عنوان انجام‌شده", command: setTaskStatus(true) },
        { id: "task-incomplete", label: "علامت‌گذاری به‌عنوان انجام‌نشده", command: setTaskStatus(false) },
      ],
    },
    {
      id: "indentation",
      label: "تورفتگی و زیرگره‌ها",
      items: [
        { id: "indent", label: "افزایش تورفتگی", shortcut: "Tab", command: indentListItem },
        { id: "outdent", label: "کاهش تورفتگی", shortcut: "Shift+Tab", command: outdentListItem },
        { id: "fold-all", label: "بستن همهٔ زیرگره‌ها", command: foldAllListNodes, separatorBefore: true },
        { id: "unfold-all", label: "بازکردن همهٔ زیرگره‌ها", command: unfoldAllListNodes },
      ],
    },
    {
      id: "paragraph-before",
      label: "درج پاراگراف قبل",
      command: insertParagraphBefore,
      separatorBefore: true,
    },
    { id: "paragraph-after", label: "درج پاراگراف بعد", command: insertParagraphAfter },
    {
      id: "reference",
      label: "ارجاع لینک",
      separatorBefore: true,
      run: () => onReference?.(),
    },
    { id: "footnote", label: "پانویس", command: insertFootnote },
    {
      id: "hr",
      label: "خط افقی",
      command: insertHorizontalRule(),
      separatorBefore: true,
    },
    { id: "toc", label: "فهرست مطالب", command: insertTableOfContents() },
    { id: "yaml", label: "YAML Front Matter", command: insertYamlFrontMatter },
  ];
}

export function ParagraphMenu({ view, onInsertReferenceLink, onNotice }: ParagraphMenuProps) {
  const { t } = useMarkdownI18n();
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuEntries = entries(onInsertReferenceLink, onNotice);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setSubmenu(null);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const run = (action: Action) => {
    if (!view || action.disabledHint) return;
    if (action.command && !action.command(view.state, undefined, view)) return;
    if (action.command) action.command(view.state, view.dispatch, view);
    else void action.run?.(view);
    setOpen(false);
    setSubmenu(null);
    view.focus();
  };

  const keepSelection = (event: ReactMouseEvent) => event.preventDefault();

  return (
    <div
      ref={rootRef}
      className="tm-editor-menu"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          setSubmenu(null);
        }
      }}
    >
      <button
        type="button"
        className="tm-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!view}
        onMouseDown={keepSelection}
        onClick={() => setOpen((value) => !value)}
      >
        <Pilcrow size={16} aria-hidden />
        <span>{t("پاراگراف")}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <div className="tm-menu-panel" role="menu" aria-label={t("پاراگراف")}>
          {menuEntries.map((entry) => {
            if (isSubmenu(entry)) {
              const expanded = submenu === entry.id;
              return (
                <div key={entry.id} className="tm-menu-group">
                  {entry.separatorBefore ? <span role="separator" className="tm-menu-separator" /> : null}
                  <button
                    type="button"
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={expanded}
                    onMouseDown={keepSelection}
                    onClick={() => setSubmenu(expanded ? null : entry.id)}
                  >
                    <span>{t(entry.label)}</span>
                    <ChevronLeft size={14} aria-hidden />
                  </button>
                  {expanded ? (
                    <div className="tm-menu-submenu" role="menu" aria-label={t(entry.label)}>
                      {entry.items.map((item) => (
                        <div key={item.id}>
                          {item.separatorBefore ? <span role="separator" className="tm-menu-separator" /> : null}
                          <button
                            type="button"
                            role="menuitem"
                            disabled={Boolean(item.disabledHint) || !view || Boolean(item.command && !item.command(view.state, undefined, view))}
                            title={item.disabledHint ? t(item.disabledHint) : undefined}
                            onMouseDown={keepSelection}
                            onClick={() => run(item)}
                          >
                            <span>{t(item.label)}</span>
                            {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            }
            return (
              <div key={entry.id}>
                {entry.separatorBefore ? <span role="separator" className="tm-menu-separator" /> : null}
                <button
                  type="button"
                  role="menuitem"
                  disabled={Boolean(entry.disabledHint) || !view || Boolean(entry.command && !entry.command(view.state, undefined, view))}
                  title={entry.disabledHint ? t(entry.disabledHint) : undefined}
                  onMouseDown={keepSelection}
                  onClick={() => run(entry)}
                >
                  <span>{t(entry.label)}</span>
                  {entry.shortcut ? <kbd>{entry.shortcut}</kbd> : null}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
