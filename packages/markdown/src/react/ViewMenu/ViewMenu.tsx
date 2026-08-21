"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ChevronDown, Eye } from "lucide-react";
import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  getWritingModes,
  toggleFocusMode,
  toggleTypewriterMode,
} from "../../core/plugins/writing-modes.js";

export interface ViewMenuProps {
  view: EditorView | null;
  outlineVisible: boolean;
  onToggleOutline: () => void;
  sourceMode: boolean;
  onToggleSource: () => void;
  statusVisible: boolean;
  onToggleStatus: () => void;
  wordCountOpen: boolean;
  onToggleWordCount: () => void;
  onSearch: () => void;
  fullscreen: boolean;
  onToggleFullscreen?: () => void;
  zoom: number;
  onZoom: (zoom: number) => void;
}

interface Action {
  id: string;
  label: string;
  shortcut?: string;
  command?: Command;
  run?: () => void;
  checked?: (view: EditorView) => boolean;
  separatorBefore?: boolean;
}

export function ViewMenu({
  view,
  outlineVisible,
  onToggleOutline,
  sourceMode,
  onToggleSource,
  statusVisible,
  onToggleStatus,
  wordCountOpen,
  onToggleWordCount,
  onSearch,
  fullscreen,
  onToggleFullscreen,
  zoom,
  onZoom,
}: ViewMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const actions: Action[] = [
    {
      id: "sidebar",
      label: "نمایش نوار کناریِ ساختار",
      shortcut: "Ctrl+Shift+L",
      run: onToggleOutline,
      checked: () => outlineVisible,
    },
    { id: "search", label: "جست‌وجو", shortcut: "Ctrl+F", run: onSearch },
    {
      id: "source",
      label: "حالت کد منبع",
      shortcut: "Ctrl+/",
      run: onToggleSource,
      checked: () => sourceMode,
      separatorBefore: true,
    },
    {
      id: "focus",
      label: "حالت تمرکز",
      shortcut: "F8",
      command: toggleFocusMode,
      checked: (editor) => getWritingModes(editor.state).focus,
      separatorBefore: true,
    },
    {
      id: "typewriter",
      label: "حالت ماشین‌تحریر",
      shortcut: "F9",
      command: toggleTypewriterMode,
      checked: (editor) => getWritingModes(editor.state).typewriter,
    },
    {
      id: "status",
      label: "نمایش نوار وضعیت",
      run: onToggleStatus,
      checked: () => statusVisible,
      separatorBefore: true,
    },
    {
      id: "word-count",
      label: "پنجرهٔ شمارش کلمات",
      run: onToggleWordCount,
      checked: () => wordCountOpen,
    },
    ...(onToggleFullscreen
      ? [
          {
            id: "fullscreen",
            label: "تمام‌صفحه",
            shortcut: "F11",
            run: onToggleFullscreen,
            checked: () => fullscreen,
            separatorBefore: true,
          } satisfies Action,
        ]
      : []),
    {
      id: "actual-size",
      label: `اندازهٔ واقعی (${zoom}٪)`,
      shortcut: "Ctrl+Shift+9",
      run: () => onZoom(100),
      separatorBefore: true,
    },
    { id: "zoom-in", label: "بزرگ‌نمایی", shortcut: "Ctrl+Shift+=", run: () => onZoom(zoom + 10) },
    { id: "zoom-out", label: "کوچک‌نمایی", shortcut: "Ctrl+Shift+-", run: () => onZoom(zoom - 10) },
  ];

  const run = (action: Action) => {
    if (!view) return;
    if (action.command && !action.command(view.state, undefined, view)) return;
    if (action.command) action.command(view.state, view.dispatch, view);
    else action.run?.();
    setOpen(false);
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
        <Eye size={16} aria-hidden />
        <span>View</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <div className="tm-menu-panel" role="menu" aria-label="View">
          {actions.map((action) => (
            <div key={action.id}>
              {action.separatorBefore ? <span role="separator" className="tm-menu-separator" /> : null}
              <button
                type="button"
                role={action.checked ? "menuitemcheckbox" : "menuitem"}
                aria-checked={action.checked?.(view!)}
                onMouseDown={keepSelection}
                onClick={() => run(action)}
              >
                <span>{action.label}</span>
                {action.shortcut ? <kbd>{action.shortcut}</kbd> : null}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
