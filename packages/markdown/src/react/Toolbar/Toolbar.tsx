"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { EditorView } from "prosemirror-view";
import { toggleMark, setBlockType } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import { schema } from "../../core/schema/index.js";
import { toggleHeading, insertZWNJ } from "../../core/plugins/keymap.js";
import { insertTable } from "../../core/commands/table.js";

/**
 * نوارِ ابزار.
 *
 * ★ دسترس‌پذیری (بندِ ۱۲): کلِ نوار **یک** توقفِ Tab است و بینِ دکمه‌ها با
 * کلیدهای جهت حرکت می‌شود — نه Tab بینِ تک‌تکِ پانزده دکمه. این الگوی
 * استانداردِ ARIA برای `role="toolbar"` است.
 */

export interface ToolbarProps {
  view: EditorView | null;
  /** دکمهٔ حالتِ سورس. */
  onToggleSource?: () => void;
  sourceMode?: boolean;
  className?: string;
}

interface Item {
  id: string;
  label: string;
  icon: string;
  run: (view: EditorView) => void;
  isActive?: (view: EditorView) => boolean;
  shortcut?: string;
}

function markActive(view: EditorView, type: (typeof schema.marks)[string]): boolean {
  const { from, $from, to, empty } = view.state.selection;
  return empty
    ? !!type.isInSet(view.state.storedMarks || $from.marks())
    : view.state.doc.rangeHasMark(from, to, type);
}

function blockActive(view: EditorView, name: string, attrs?: Record<string, unknown>): boolean {
  const { $from } = view.state.selection;
  const node = $from.parent;
  if (node.type.name !== name) return false;
  if (!attrs) return true;
  return Object.entries(attrs).every(([k, v]) => node.attrs[k] === v);
}

const ITEMS: Item[] = [
  {
    id: "bold",
    label: "پررنگ",
    icon: "B",
    shortcut: "Ctrl+B",
    run: (v) => toggleMark(schema.marks.strong)(v.state, v.dispatch, v),
    isActive: (v) => markActive(v, schema.marks.strong),
  },
  {
    id: "italic",
    label: "کج",
    icon: "I",
    shortcut: "Ctrl+I",
    run: (v) => toggleMark(schema.marks.em)(v.state, v.dispatch, v),
    isActive: (v) => markActive(v, schema.marks.em),
  },
  {
    id: "strike",
    label: "خط‌خورده",
    icon: "S",
    run: (v) => toggleMark(schema.marks.strike)(v.state, v.dispatch, v),
    isActive: (v) => markActive(v, schema.marks.strike),
  },
  {
    id: "code",
    label: "کدِ درون‌خطی",
    icon: "‹›",
    shortcut: "Ctrl+`",
    run: (v) => toggleMark(schema.marks.code)(v.state, v.dispatch, v),
    isActive: (v) => markActive(v, schema.marks.code),
  },
  {
    id: "h1",
    label: "عنوانِ ۱",
    icon: "H₁",
    shortcut: "Ctrl+1",
    run: (v) => toggleHeading(1)(v.state, v.dispatch, v),
    isActive: (v) => blockActive(v, "heading", { level: 1 }),
  },
  {
    id: "h2",
    label: "عنوانِ ۲",
    icon: "H₂",
    shortcut: "Ctrl+2",
    run: (v) => toggleHeading(2)(v.state, v.dispatch, v),
    isActive: (v) => blockActive(v, "heading", { level: 2 }),
  },
  {
    id: "h3",
    label: "عنوانِ ۳",
    icon: "H₃",
    shortcut: "Ctrl+3",
    run: (v) => toggleHeading(3)(v.state, v.dispatch, v),
    isActive: (v) => blockActive(v, "heading", { level: 3 }),
  },
  {
    id: "ul",
    label: "فهرستِ نقطه‌ای",
    icon: "•",
    shortcut: "Ctrl+Shift+8",
    run: (v) => wrapInList(schema.nodes.bullet_list)(v.state, v.dispatch),
  },
  {
    id: "ol",
    label: "فهرستِ شماره‌دار",
    icon: "۱.",
    shortcut: "Ctrl+Shift+7",
    run: (v) => wrapInList(schema.nodes.ordered_list)(v.state, v.dispatch),
  },
  {
    id: "quote",
    label: "نقلِ قول",
    icon: "❝",
    run: (v) => {
      const { blockquote } = schema.nodes;
      const { $from } = v.state.selection;
      // اگر داخلِ نقلِ‌قول است، دربیاورش؛ وگرنه بپیچانش.
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type === blockquote) {
          setBlockType(schema.nodes.paragraph)(v.state, v.dispatch);
          return;
        }
      }
      const range = $from.blockRange();
      if (range) v.dispatch(v.state.tr.wrap(range, [{ type: blockquote }]));
    },
  },
  {
    id: "codeblock",
    label: "بلوکِ کد",
    icon: "{}",
    shortcut: "Ctrl+Shift+K",
    run: (v) => setBlockType(schema.nodes.code_block)(v.state, v.dispatch),
    isActive: (v) => blockActive(v, "code_block"),
  },
  {
    id: "table",
    label: "جدول",
    icon: "▦",
    run: (v) => insertTable(3, 3)(v.state, v.dispatch),
  },
  {
    id: "hr",
    label: "جداکننده",
    icon: "—",
    run: (v) => v.dispatch(v.state.tr.replaceSelectionWith(schema.nodes.horizontal_rule.create())),
  },
  {
    id: "zwnj",
    label: "نیم‌فاصله",
    icon: "‌↔",
    shortcut: "Shift+Space",
    run: (v) => insertZWNJ(v.state, v.dispatch, v),
  },
];

export function Toolbar({ view, onToggleSource, sourceMode, className }: ToolbarProps) {
  const [focusIndex, setFocusIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  /** برای رندرِ دوباره وقتی انتخاب عوض می‌شود — تا حالتِ فعال درست بماند. */
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!view) return;
    // حالتِ «فعال» دکمه‌ها به انتخابِ فعلی بستگی دارد، و انتخاب داخلِ
    // ProseMirror عوض می‌شود نه React. پس با رویدادهای انتخاب رندر
    // می‌گیریم — ساده‌تر و کم‌خطرتر از دست‌کاریِ dispatchTransaction.
    const onSelect = () => forceRender((n) => n + 1);
    view.dom.addEventListener("keyup", onSelect);
    view.dom.addEventListener("mouseup", onSelect);
    document.addEventListener("selectionchange", onSelect);
    return () => {
      view.dom.removeEventListener("keyup", onSelect);
      view.dom.removeEventListener("mouseup", onSelect);
      document.removeEventListener("selectionchange", onSelect);
    };
  }, [view]);

  const items = onToggleSource
    ? [
        ...ITEMS,
        {
          id: "source",
          label: sourceMode ? "حالتِ ویرایش" : "حالتِ سورس",
          icon: "⌨",
          shortcut: "Ctrl+/",
          run: () => onToggleSource(),
          isActive: () => !!sourceMode,
        } as Item,
      ]
    : ITEMS;

  const move = useCallback(
    (delta: number) => {
      const next = (focusIndex + delta + items.length) % items.length;
      setFocusIndex(next);
      ref.current
        ?.querySelectorAll<HTMLButtonElement>("button")
        [next]?.focus();
    },
    [focusIndex, items.length],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          move(rtl ? -1 : 1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          move(rtl ? 1 : -1);
          break;
        case "Home":
          e.preventDefault();
          setFocusIndex(0);
          ref.current?.querySelector("button")?.focus();
          break;
        case "End": {
          e.preventDefault();
          const buttons = ref.current?.querySelectorAll<HTMLButtonElement>("button");
          setFocusIndex(items.length - 1);
          buttons?.[buttons.length - 1]?.focus();
          break;
        }
      }
    },
    [move, items.length],
  );

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="ابزارِ قالب‌بندی"
      aria-orientation="horizontal"
      className={`tm-toolbar ${className ?? ""}`}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) => {
        const active = view && item.isActive ? item.isActive(view) : false;
        return (
          <button
            key={item.id}
            type="button"
            className="tm-toolbar-button"
            // فقط یکی از دکمه‌ها در ترتیبِ Tab است — بقیه با کلیدِ جهت.
            tabIndex={index === focusIndex ? 0 : -1}
            aria-pressed={item.isActive ? active : undefined}
            aria-label={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
            title={item.shortcut ? `${item.label} — ${item.shortcut}` : item.label}
            disabled={!view}
            onMouseDown={(e) => {
              // بی این، کلیک روی دکمه فوکوس را از ادیتور می‌گیرد و
              // انتخابِ کاربر از بین می‌رود.
              e.preventDefault();
            }}
            onClick={() => {
              if (!view) return;
              item.run(view);
              view.focus();
              setFocusIndex(index);
            }}
          >
            <span aria-hidden="true">{item.icon}</span>
          </button>
        );
      })}
    </div>
  );
}
