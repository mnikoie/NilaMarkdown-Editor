"use client";

import { useCallback, useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ChevronDown, ChevronLeft, Plus } from "lucide-react";
import { setBlockType } from "prosemirror-commands";
import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { insertTable } from "../../core/commands/table.js";
import {
  insertAlert,
  insertFootnote,
  insertHorizontalRule,
  insertMathBlock,
  insertTableOfContents,
  insertYamlFrontMatter,
} from "../../core/commands/paragraph.js";
import { schema } from "../../core/schema/index.js";
import { useMarkdownI18n } from "../i18n.js";
import { useMenuKeyboard } from "../useMenuKeyboard.js";

export interface InsertMenuProps {
  view: EditorView | null;
  onInsertLink?: () => void;
  onInsertReferenceLink?: () => void;
  onInsertImage?: () => void;
  onInsertLocalImage?: () => void;
  onSourceAction?: (id: string) => void;
}

interface Action {
  id: string;
  label: string;
  shortcut?: string;
  command?: Command;
  run?: () => void;
  separatorBefore?: boolean;
}

interface Submenu { id: string; label: string; items: Action[]; separatorBefore?: boolean }
type Entry = Action | Submenu;
const isSubmenu = (entry: Entry): entry is Submenu => "items" in entry;

export function InsertMenu({
  view,
  onInsertLink,
  onInsertReferenceLink,
  onInsertImage,
  onInsertLocalImage,
  onSourceAction,
}: InsertMenuProps) {
  const { t } = useMarkdownI18n();
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<string | null>(null);
  const close = useCallback(() => { setOpen(false); setSubmenu(null); }, []);
  const { rootRef, triggerRef, onKeyDown } = useMenuKeyboard(open, close);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [close, open, rootRef]);

  const entries: Entry[] = [
    { id: "hyperlink", label: "پیوند…", shortcut: "Ctrl+K", run: onInsertLink },
    { id: "reference", label: "پیوند ارجاعی…", run: onInsertReferenceLink },
    {
      id: "image",
      label: "تصویر",
      items: [
        { id: "image-url", label: "از نشانی اینترنتی…", run: onInsertImage },
        { id: "image-local", label: "از فایل محلی…", run: onInsertLocalImage },
      ],
    },
    { id: "table-insert", label: "جدول", shortcut: "Ctrl+Alt+T", command: insertTable(3, 3), separatorBefore: true },
    { id: "code-block", label: "بلوک کد", shortcut: "Ctrl+Shift+K", command: setBlockType(schema.nodes.code_block) },
    { id: "math", label: "فرمول ریاضی", shortcut: "Ctrl+Shift+M", command: insertMathBlock() },
    {
      id: "alerts",
      label: "کادر اطلاع‌رسانی",
      items: [
        { id: "alert-note", label: "یادداشت (Note)", command: insertAlert("note") },
        { id: "alert-tip", label: "نکته (Tip)", command: insertAlert("tip") },
        { id: "alert-important", label: "مهم (Important)", command: insertAlert("important") },
        { id: "alert-warning", label: "هشدار (Warning)", command: insertAlert("warning") },
        { id: "alert-caution", label: "احتیاط (Caution)", command: insertAlert("caution") },
      ],
    },
    { id: "footnote", label: "پانویس", command: insertFootnote, separatorBefore: true },
    { id: "toc", label: "فهرست مطالب", command: insertTableOfContents() },
    { id: "hr", label: "خط جداکننده", command: insertHorizontalRule() },
    { id: "yaml", label: "مشخصات سند (YAML)", command: insertYamlFrontMatter },
  ];

  const run = (action: Action) => {
    if (onSourceAction) onSourceAction(action.id);
    else if (action.command && view && action.command(view.state, undefined, view)) action.command(view.state, view.dispatch, view);
    else action.run?.();
    close();
    view?.focus();
  };
  const keepSelection = (event: ReactMouseEvent) => event.preventDefault();

  return (
    <div ref={rootRef} className="tm-editor-menu" onKeyDown={onKeyDown}>
      <button ref={triggerRef} type="button" className="tm-menu-trigger" aria-haspopup="menu" aria-expanded={open}
        disabled={!view && !onSourceAction} onMouseDown={keepSelection} onClick={() => setOpen((value) => !value)}>
        <Plus size={16} aria-hidden />
        <span>{t("Insert")}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <div className="tm-menu-panel" role="menu" aria-label={t("Insert") }>
          {entries.map((entry) => isSubmenu(entry) ? (
            <div key={entry.id} className="tm-menu-group">
              {entry.separatorBefore ? <span role="separator" className="tm-menu-separator" /> : null}
              <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={submenu === entry.id}
                onMouseDown={keepSelection} onClick={() => setSubmenu(submenu === entry.id ? null : entry.id)}>
                <span>{t(entry.label)}</span><ChevronLeft size={14} aria-hidden />
              </button>
              {submenu === entry.id ? (
                <div className="tm-menu-submenu" role="menu" aria-label={t(entry.label)}>
                  {entry.items.map((item) => (
                    <button key={item.id} type="button" role="menuitem" onMouseDown={keepSelection} onClick={() => run(item)}>
                      <span>{t(item.label)}</span>{item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div key={entry.id}>
              {entry.separatorBefore ? <span role="separator" className="tm-menu-separator" /> : null}
              <button type="button" role="menuitem" onMouseDown={keepSelection} onClick={() => run(entry)}>
                <span>{t(entry.label)}</span>{entry.shortcut ? <kbd>{entry.shortcut}</kbd> : null}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
