"use client";

import { useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ChevronDown, ChevronLeft, Pilcrow } from "lucide-react";
import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { setBlockType } from "prosemirror-commands";
import {
  changeHeadingLevel,
  indentListItem,
  insertParagraphAfter,
  insertParagraphBefore,
  outdentListItem,
  setParagraph,
  toggleBlockquote,
  toggleBulletList,
  toggleOrderedList,
} from "../../core/commands/paragraph.js";
import { setTaskStatus, toggleTaskList } from "../../core/commands/task-list.js";
import { foldAllListNodes, unfoldAllListNodes } from "../../core/plugins/list-fold.js";
import { schema } from "../../core/schema/index.js";
import { useMarkdownI18n } from "../i18n.js";
import { useMenuKeyboard } from "../useMenuKeyboard.js";

export interface ParagraphMenuProps {
  view: EditorView | null;
  onInsertReferenceLink?: () => void;
  onNotice?: (message: string) => void;
  /** اجرای معادلِ خامِ Markdown در حالتِ Source. */
  onSourceAction?: (id: string) => void;
  sourceActiveIds?: ReadonlySet<string>;
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

function entries(): Entry[] {
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
  ];
}

export function ParagraphMenu({ view, onSourceAction }: ParagraphMenuProps) {
  const { t } = useMarkdownI18n();
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<string | null>(null);
  const closeMenu = () => { setOpen(false); setSubmenu(null); };
  const { rootRef, triggerRef, onKeyDown } = useMenuKeyboard(open, closeMenu);
  const menuEntries = entries();

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
    if (onSourceAction) {
      onSourceAction(action.id);
      setOpen(false);
      setSubmenu(null);
      return;
    }
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
    <div ref={rootRef} className="tm-editor-menu" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className="tm-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!view && !onSourceAction}
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
                            disabled={Boolean(item.disabledHint) || (!onSourceAction && (!view || Boolean(item.command && !item.command(view.state, undefined, view))))}
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
                  disabled={Boolean(entry.disabledHint) || (!onSourceAction && (!view || Boolean(entry.command && !entry.command(view.state, undefined, view))))}
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
