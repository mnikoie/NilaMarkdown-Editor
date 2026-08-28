"use client";

import { useCallback, useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ChevronDown, ChevronLeft, FileText } from "lucide-react";
import { useMarkdownI18n } from "../i18n.js";
import { useMenuKeyboard } from "../useMenuKeyboard.js";

export interface FileMenuProps {
  onNew?: () => void;
  onOpen?: () => void;
  onOpenUrl?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onExportHtml?: () => void;
  onExportPdf?: () => void;
  onClose?: () => void;
  /** آیا سند نسبت به آخرین ذخیره تغییر کرده است؟ */
  dirty?: boolean;
}

interface Action {
  id: string;
  label: string;
  shortcut?: string;
  run?: () => void;
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

/** منوی File مستقل از چیدمانِ MarkdownEditor؛ عملیات واقعی با callbackهای میزبان است. */
export function FileMenu({
  onNew,
  onOpen,
  onOpenUrl,
  onSave,
  onSaveAs,
  onExportHtml,
  onExportPdf,
  onClose,
  dirty = false,
}: FileMenuProps) {
  const { t } = useMarkdownI18n();
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<string | null>(null);
  const closeMenu = useCallback(() => { setOpen(false); setSubmenu(null); }, []);
  const { rootRef, triggerRef, onKeyDown } = useMenuKeyboard(open, closeMenu);

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

  const entries: Entry[] = [
    { id: "new", label: "سند جدید", shortcut: "Ctrl+N", run: onNew },
    { id: "open", label: "بازکردن…", shortcut: "Ctrl+O", run: onOpen },
    { id: "open-url", label: "بازکردن از نشانی…", run: onOpenUrl },
    { id: "save", label: "ذخیره", shortcut: "Ctrl+S", run: onSave, separatorBefore: true },
    { id: "save-as", label: "ذخیره با نام…", shortcut: "Ctrl+Shift+S", run: onSaveAs },
    {
      id: "export",
      label: "خروجی",
      separatorBefore: true,
      items: [
        { id: "export-html", label: "HTML", run: onExportHtml },
        { id: "export-pdf", label: "PDF / چاپ", shortcut: "Ctrl+P", run: onExportPdf },
      ],
    },
    ...(onClose
      ? [{ id: "close", label: "بستن سند", shortcut: "Ctrl+W", run: onClose, separatorBefore: true }]
      : []),
  ];

  const run = (action: Action) => {
    if (!action.run) return;
    action.run();
    setOpen(false);
    setSubmenu(null);
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
        onMouseDown={keepSelection}
        onClick={() => setOpen((value) => !value)}
      >
        <FileText size={16} aria-hidden />
        <span>{t("File")}</span>
        {dirty ? <span className="tm-menu-dirty" title={t("تغییرات ذخیره‌نشده")} aria-label={t("تغییرات ذخیره‌نشده")}>●</span> : null}
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <div className="tm-menu-panel" role="menu" aria-label={t("File")}>
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
                    <span>{t(entry.label)}</span>
                    <ChevronLeft size={14} aria-hidden />
                  </button>
                  {expanded ? (
                    <div className="tm-menu-submenu" role="menu" aria-label={t(entry.label)}>
                      {entry.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          disabled={!item.run}
                          onMouseDown={keepSelection}
                          onClick={() => run(item)}
                        >
                          <span>{t(item.label)}</span>
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
                  disabled={!entry.run}
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
