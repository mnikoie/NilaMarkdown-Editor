"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ALargeSmall, ChevronDown, ChevronLeft } from "lucide-react";
import { toggleMark } from "prosemirror-commands";
import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { clearFormatting } from "../../core/commands/format.js";
import { getActiveLink, unsetLink } from "../../core/commands/link.js";
import { safeHref } from "../../core/security.js";
import { useMarkdownI18n } from "../i18n.js";
import { schema } from "../../core/schema/index.js";

export interface FormatMenuProps {
  view: EditorView | null;
  onEditLink?: () => void;
  onInsertImage?: () => void;
  onInsertLocalImage?: () => void;
  onNotice?: (message: string) => void;
}

interface Action {
  id: string;
  label: string;
  shortcut?: string;
  command?: Command;
  run?: (view: EditorView) => void | Promise<void>;
  enabled?: (view: EditorView) => boolean;
  checked?: (view: EditorView) => boolean;
  separatorBefore?: boolean;
}

interface Submenu {
  id: string;
  label: string;
  items: Action[];
  enabled?: (view: EditorView) => boolean;
  separatorBefore?: boolean;
}

type Entry = Action | Submenu;

function isSubmenu(entry: Entry): entry is Submenu {
  return "items" in entry;
}

function markActive(view: EditorView, mark: (typeof schema.marks)[string]): boolean {
  const { empty, from, to, $from } = view.state.selection;
  return empty
    ? Boolean(mark.isInSet(view.state.storedMarks ?? $from.marks()))
    : view.state.doc.rangeHasMark(from, to, mark);
}

async function copyText(text: string, onNotice?: (message: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    onNotice?.("نشانیِ لینک کپی شد.");
  } catch {
    onNotice?.("دسترسی به کلیپ‌بورد ممکن نشد.");
  }
}

export function FormatMenu({
  view,
  onEditLink,
  onInsertImage,
  onInsertLocalImage,
  onNotice,
}: FormatMenuProps) {
  const { t } = useMarkdownI18n();
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

  const hasLink = (editor: EditorView) => Boolean(getActiveLink(editor.state));
  const entries: Entry[] = [
    {
      id: "strong",
      label: "پررنگ (Strong)",
      shortcut: "Ctrl+B",
      command: toggleMark(schema.marks.strong),
      checked: (editor) => markActive(editor, schema.marks.strong),
    },
    {
      id: "emphasis",
      label: "تأکید (Emphasis)",
      shortcut: "Ctrl+I",
      command: toggleMark(schema.marks.em),
      checked: (editor) => markActive(editor, schema.marks.em),
    },
    {
      id: "underline",
      label: "زیرخط (Underline)",
      shortcut: "Ctrl+U",
      command: toggleMark(schema.marks.underline),
      checked: (editor) => markActive(editor, schema.marks.underline),
    },
    {
      id: "code",
      label: "کد (Code)",
      shortcut: "Ctrl+Shift+`",
      command: toggleMark(schema.marks.code),
      checked: (editor) => markActive(editor, schema.marks.code),
    },
    {
      id: "strike",
      label: "خط‌خورده (Strike)",
      shortcut: "Alt+Shift+5",
      command: toggleMark(schema.marks.strike),
      checked: (editor) => markActive(editor, schema.marks.strike),
      separatorBefore: true,
    },
    {
      id: "comment",
      label: "توضیح پنهان (Comment)",
      command: toggleMark(schema.marks.comment),
      checked: (editor) => markActive(editor, schema.marks.comment),
    },
    {
      id: "hyperlink",
      label: "لینک (Hyperlink)",
      shortcut: "Ctrl+K",
      run: () => onEditLink?.(),
      separatorBefore: true,
    },
    {
      id: "hyperlink-actions",
      label: "کارهای لینک",
      enabled: hasLink,
      items: [
        {
          id: "link-open",
          label: "بازکردن لینک",
          run: (editor) => {
            const active = getActiveLink(editor.state);
            if (!active) return;
            const href = safeHref(active.href);
            if (href === "#blocked") {
              onNotice?.("نشانیِ لینک ناامن است.");
              return;
            }
            window.open(href, "_blank", "noopener,noreferrer");
          },
        },
        {
          id: "link-copy",
          label: "کپی نشانی لینک",
          run: async (editor) => {
            const active = getActiveLink(editor.state);
            if (active) await copyText(active.href, onNotice);
          },
        },
        { id: "link-edit", label: "ویرایش لینک", run: () => onEditLink?.() },
        {
          id: "link-remove",
          label: "حذف لینک",
          command: unsetLink,
          separatorBefore: true,
        },
      ],
    },
    {
      id: "image",
      label: "تصویر",
      items: [
        {
          id: "image-url",
          label: "درج تصویر از نشانی",
          shortcut: "Ctrl+Shift+I",
          run: () => onInsertImage?.(),
        },
        {
          id: "image-local",
          label: "درج تصویر محلی…",
          run: () => onInsertLocalImage?.(),
        },
      ],
    },
    {
      id: "clear",
      label: "پاک‌کردن قالب‌بندی",
      shortcut: "Ctrl+\\",
      command: clearFormatting,
      separatorBefore: true,
    },
  ];

  const enabled = (action: Action | Submenu) =>
    Boolean(view) && (!action.enabled || Boolean(view && action.enabled(view)));

  const run = (action: Action) => {
    if (!view || !enabled(action)) return;
    if (action.command && !action.command(view.state, undefined, view)) return;
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
        <ALargeSmall size={16} aria-hidden />
        <span>{t("Format")}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <div className="tm-menu-panel" role="menu" aria-label={t("Format")}>
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
                    disabled={!enabled(entry)}
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
                            role={item.checked ? "menuitemcheckbox" : "menuitem"}
                            aria-checked={item.checked?.(view!)}
                            disabled={!enabled(item)}
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
                  role={entry.checked ? "menuitemcheckbox" : "menuitem"}
                  aria-checked={entry.checked?.(view!)}
                  disabled={!enabled(entry)}
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
