"use client";

import { useEffect, useState } from "react";
import type { EditorView } from "prosemirror-view";
import { getSlashState, runSlashItem, type SlashItem } from "../../core/plugins/slash-menu.js";

/**
 * منوی `/`.
 *
 * ★ موقعیتش را از خودِ ادیتور می‌گیرد (`coordsAtPos`)، نه از رویدادِ ماوس —
 * چون منو با تایپ باز می‌شود نه با کلیک.
 */

export interface SlashMenuProps {
  view: EditorView | null;
}

interface Position {
  top: number;
  left: number;
}

export function SlashMenu({ view }: SlashMenuProps) {
  const [, forceRender] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);

  // با هر تغییرِ سند یا انتخاب، دوباره رندر می‌گیریم تا منو به‌روز بماند.
  useEffect(() => {
    if (!view) return;
    const update = () => forceRender((n) => n + 1);
    view.dom.addEventListener("keyup", update);
    view.dom.addEventListener("input", update);
    document.addEventListener("selectionchange", update);
    return () => {
      view.dom.removeEventListener("keyup", update);
      view.dom.removeEventListener("input", update);
      document.removeEventListener("selectionchange", update);
    };
  }, [view]);

  const state = view ? getSlashState(view.state) : null;
  const active = state?.active ?? false;

  useEffect(() => {
    if (!view || !active || !state || state.from < 0) {
      setPosition(null);
      return;
    }
    try {
      const coords = view.coordsAtPos(state.from);
      const parent = view.dom.getBoundingClientRect();
      setPosition({
        top: coords.bottom - parent.top + 4,
        left: coords.left - parent.left,
      });
    } catch {
      // موقعیت هنوز در DOM نیست — دفعهٔ بعد.
      setPosition(null);
    }
  }, [view, active, state?.from, state?.query]);

  if (!view || !active || !state || state.items.length === 0 || !position) return null;

  // گروه‌بندی برای خوانایی
  const groups = new Map<string, SlashItem[]>();
  for (const item of state.items) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }

  let flatIndex = -1;

  return (
    <div
      className="tm-slash-menu"
      style={{ top: position.top, left: position.left }}
      role="listbox"
      aria-label="درجِ بلوک"
    >
      {[...groups.entries()].map(([group, items]) => (
        <div key={group} className="tm-slash-group">
          <div className="tm-slash-group-label">{group}</div>
          {items.map((item) => {
            flatIndex++;
            const index = flatIndex;
            const selected = index === state.selected;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`tm-slash-item ${selected ? "tm-slash-selected" : ""}`}
                // بی این، کلیک فوکوس را از ادیتور می‌گیرد و موقعیتِ `/`
                // از دست می‌رود.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  runSlashItem(view.state, view.dispatch, item, state);
                  view.focus();
                }}
              >
                <span className="tm-slash-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
