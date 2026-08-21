"use client";

import { useCallback, useEffect, useState } from "react";
import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
  setColumnAlign,
} from "../../core/commands/table.js";

export interface TableToolsProps {
  view: EditorView | null;
  active?: boolean;
  enabled?: boolean;
}

/** ابزارهای جدولی فقط وقتی مکان‌نما داخلِ جدول است دیده می‌شوند. */
export function TableTools({ view, active, enabled = true }: TableToolsProps) {
  const [visible, setVisible] = useState(false);

  const sync = useCallback(() => setVisible(Boolean(view && isInTable(view.state))), [view]);
  useEffect(() => {
    if (!view) return;
    sync();
    const later = () => requestAnimationFrame(sync);
    view.dom.addEventListener("keyup", later);
    view.dom.addEventListener("mouseup", later);
    document.addEventListener("selectionchange", later);
    return () => {
      view.dom.removeEventListener("keyup", later);
      view.dom.removeEventListener("mouseup", later);
      document.removeEventListener("selectionchange", later);
    };
  }, [view, sync]);

  if (!view || !enabled || !(active || visible)) return null;

  const run = (command: Command) => {
    command(view.state, view.dispatch, view);
    view.focus();
    sync();
  };

  const button = (label: string, command: Command, danger = false) => (
    <button
      key={label}
      type="button"
      className={danger ? "tm-table-tool-danger" : undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => run(command)}
    >
      {label}
    </button>
  );

  return (
    <div className="tm-table-tools" role="toolbar" aria-label="ابزارِ جدول">
      <span className="tm-table-tools-label">جدول</span>
      {button("ردیف قبل", addRowBefore)}
      {button("ردیف بعد", addRowAfter)}
      {button("حذف ردیف", deleteRow)}
      <span className="tm-table-tools-separator" role="separator" />
      {button("ستون قبل", addColumnBefore)}
      {button("ستون بعد", addColumnAfter)}
      {button("حذف ستون", deleteColumn)}
      <span className="tm-table-tools-separator" role="separator" />
      {button("راست", setColumnAlign("right"))}
      {button("وسط", setColumnAlign("center"))}
      {button("چپ", setColumnAlign("left"))}
      {button("حذف جدول", deleteTable, true)}
    </div>
  );
}
