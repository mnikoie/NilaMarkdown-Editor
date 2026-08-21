"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ChevronDown, ChevronLeft, Pencil } from "lucide-react";
import { DOMSerializer } from "prosemirror-model";
import { selectAll } from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  deleteSelectionOrBlock,
  duplicateSelectionOrBlock,
  selectedMarkdown,
  selectedText,
} from "../../core/commands/edit.js";
import { moveRow } from "../../core/commands/table.js";
import { schema } from "../../core/schema/index.js";

export interface EditMenuProps {
  view: EditorView | null;
  onFind?: () => void;
  onReplace?: () => void;
  onNotice?: (message: string) => void;
}

interface Action {
  id: string;
  label: string;
  shortcut?: string;
  command?: Command;
  run?: (view: EditorView) => void | Promise<void>;
  enabled?: (view: EditorView) => boolean;
  separatorBefore?: boolean;
}

interface Submenu {
  id: string;
  label: string;
  items: Action[];
  separatorBefore?: boolean;
}

type Entry = Action | Submenu;
const isSubmenu = (entry: Entry): entry is Submenu => "items" in entry;

async function writeClipboard(text: string, notice?: (message: string) => void) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    notice?.("دسترسی به کلیپ‌بورد ممکن نشد.");
  }
}

function selectedHtml(view: EditorView): string {
  if (view.state.selection.empty) return "";
  const fragment = view.state.selection.content().content;
  const wrapper = document.createElement("div");
  wrapper.append(DOMSerializer.fromSchema(schema).serializeFragment(fragment));
  return wrapper.innerHTML;
}

/** منوی Edit با فرمان‌های قابل‌انتقال از Typora. */
export function EditMenu({ view, onFind, onReplace, onNotice }: EditMenuProps) {
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const hasSelection = (editor: EditorView) => !editor.state.selection.empty;
  const entries: Entry[] = [
    { id: "undo", label: "واگرد", shortcut: "Ctrl+Z", command: undo },
    { id: "redo", label: "ازنو", shortcut: "Ctrl+Y", command: redo },
    {
      id: "cut",
      label: "برش",
      shortcut: "Ctrl+X",
      enabled: hasSelection,
      run: async (editor) => {
        const text = selectedText(editor.state);
        await writeClipboard(text, onNotice);
        if (text) editor.dispatch(editor.state.tr.deleteSelection().scrollIntoView());
      },
      separatorBefore: true,
    },
    {
      id: "copy",
      label: "کپی",
      shortcut: "Ctrl+C",
      enabled: hasSelection,
      run: (editor) => writeClipboard(selectedText(editor.state), onNotice),
    },
    {
      id: "copy-as",
      label: "کپی به‌عنوان",
      items: [
        {
          id: "copy-markdown",
          label: "Markdown",
          shortcut: "Ctrl+Shift+C",
          enabled: hasSelection,
          run: (editor) => writeClipboard(selectedMarkdown(editor.state), onNotice),
        },
        {
          id: "copy-html",
          label: "کد HTML",
          enabled: hasSelection,
          run: (editor) => writeClipboard(selectedHtml(editor), onNotice),
        },
        {
          id: "copy-plain",
          label: "متن ساده",
          enabled: hasSelection,
          run: (editor) => writeClipboard(selectedText(editor.state), onNotice),
        },
      ],
    },
    {
      id: "paste-plain",
      label: "چسباندن به‌صورت متن ساده",
      shortcut: "Ctrl+Shift+V",
      run: async (editor) => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) editor.dispatch(editor.state.tr.insertText(text).scrollIntoView());
        } catch {
          onNotice?.("خواندنِ کلیپ‌بورد ممکن نشد.");
        }
      },
    },
    { id: "select-all", label: "انتخاب همه", shortcut: "Ctrl+A", command: selectAll, separatorBefore: true },
    { id: "move-row-up", label: "انتقال ردیف به بالا", shortcut: "Alt+↑", command: moveRow(-1), separatorBefore: true },
    { id: "move-row-down", label: "انتقال ردیف به پایین", shortcut: "Alt+↓", command: moveRow(1) },
    { id: "duplicate", label: "تکثیر", command: duplicateSelectionOrBlock },
    { id: "delete", label: "حذف", command: deleteSelectionOrBlock },
    {
      id: "find-replace",
      label: "جست‌وجو و جایگزینی",
      separatorBefore: true,
      items: [
        { id: "find", label: "جست‌وجو", shortcut: "Ctrl+F", run: () => onFind?.() },
        { id: "replace", label: "جایگزینی", shortcut: "Ctrl+H", run: () => onReplace?.() },
      ],
    },
  ];

  const enabled = (action: Action) =>
    Boolean(view) && (!action.enabled || Boolean(view && action.enabled(view))) &&
    (!action.command || Boolean(view && action.command(view.state, undefined, view)));

  const run = (action: Action) => {
    if (!view || !enabled(action)) return;
    if (action.command) action.command(view.state, view.dispatch, view);
    else void action.run?.(view);
    setOpen(false);
    setSubmenu(null);
    view.focus();
  };
  const keepSelection = (event: ReactMouseEvent) => event.preventDefault();

  return (
    <div ref={rootRef} className="tm-editor-menu">
      <button
        type="button"
        className="tm-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!view}
        onMouseDown={keepSelection}
        onClick={() => setOpen((value) => !value)}
      >
        <Pencil size={16} aria-hidden />
        <span>Edit</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <div className="tm-menu-panel" role="menu" aria-label="Edit">
          {entries.map((entry) => {
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
                    <span>{entry.label}</span>
                    <ChevronLeft size={14} aria-hidden />
                  </button>
                  {expanded ? (
                    <div className="tm-menu-submenu" role="menu" aria-label={entry.label}>
                      {entry.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          disabled={!enabled(item)}
                          onMouseDown={keepSelection}
                          onClick={() => run(item)}
                        >
                          <span>{item.label}</span>
                          {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
                        </button>
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
                  disabled={!enabled(entry)}
                  onMouseDown={keepSelection}
                  onClick={() => run(entry)}
                >
                  <span>{entry.label}</span>
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
