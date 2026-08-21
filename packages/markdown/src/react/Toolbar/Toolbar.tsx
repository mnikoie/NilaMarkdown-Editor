"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType, KeyboardEvent } from "react";
import {
  Bold,
  Code,
  FileCode,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Link,
  Maximize2,
  Minimize2,
  Minus,
  Printer,
  Quote,
  Space,
  SquareCode,
  Strikethrough,
  Table,
} from "lucide-react";
import type { EditorView } from "prosemirror-view";
import { toggleMark, setBlockType } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import { schema } from "../../core/schema/index.js";
import { toggleHeading, insertZWNJ } from "../../core/plugins/keymap.js";
import { insertTable } from "../../core/commands/table.js";
import { isTaskList, toggleTaskList } from "../../core/commands/task-list.js";

/**
 * نوارِ ابزار.
 *
 * ★ دسترس‌پذیری (بندِ ۱۲): کلِ نوار **یک** توقفِ Tab است و بینِ دکمه‌ها با
 * کلیدهای جهت حرکت می‌شود — نه Tab بینِ تک‌تکِ دکمه‌ها. این الگوی
 * استانداردِ ARIA برای `role="toolbar"` است.
 */

export interface ToolbarProps {
  view: EditorView | null;
  /** دکمهٔ حالتِ سورس. */
  onToggleSource?: () => void;
  sourceMode?: boolean;
  /** دکمهٔ تمام‌صفحه. */
  onToggleFullscreen?: () => void;
  fullscreen?: boolean;
  /** دکمهٔ خروجیِ PDF. */
  onExportPdf?: () => void;
  /** بازکردنِ ویرایشگرِ لینک. */
  onEditLink?: () => void;
  className?: string;
}

/**
 * آیکون‌ها از `lucide-react`.
 *
 * ★ **چرا آیکونِ واقعی و نه گلیفِ متنی.** نسخهٔ اول از کاراکترهایی مثل
 * `{}` و `⤢` و `⎙` استفاده می‌کرد. در مرورگر که نگاه شد، نوار یک ردیفِ
 * علامتِ ریزِ نامفهوم بود — هیچ‌کس با دیدنشان نمی‌فهمید کدام چه می‌کند.
 * بدتر: رندرِ گلیف به فونتِ سیستم بستگی دارد، پس روی هر دستگاه شکلِ
 * دیگری می‌گرفت.
 *
 * ★ `lucide-react` **peerDependencyِ اختیاری** است، پس به کسی تحمیل
 * نمی‌شود؛ ولی چون tree-shakable است، فقط آیکون‌های لازم به باندلِ
 * مصرف‌کننده می‌روند، نه کلِ کتابخانه.
 */
type IconComponent = ComponentType<{ size?: number | string; "aria-hidden"?: boolean }>;

interface Item {
  id: string;
  label: string;
  icon: IconComponent;
  run: (view: EditorView) => void;
  isActive?: (view: EditorView) => boolean;
  shortcut?: string;
  /** پیش از این دکمه یک جداکنندهٔ دیداری بیاید. */
  startsGroup?: boolean;
  /**
   * دکمهٔ **سند** است نه قالب‌بندی (چاپ، تمام‌صفحه، سورس).
   *
   * ★ این‌ها به لبهٔ دیگرِ نوار می‌روند. با گلیف‌های پشتِ‌هم و بی
   * دسته‌بندی، چشم چیزی پیدا نمی‌کند — و «پررنگ» و «خروجیِ PDF» دو
   * چیزِ کاملاً متفاوت‌اند که نباید کنارِ هم و هم‌شکل باشند.
   */
  document?: boolean;
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
    icon: Bold,
    shortcut: "Ctrl+B",
    run: (v) => toggleMark(schema.marks.strong)(v.state, v.dispatch, v),
    isActive: (v) => markActive(v, schema.marks.strong),
  },
  {
    id: "italic",
    label: "کج",
    icon: Italic,
    shortcut: "Ctrl+I",
    run: (v) => toggleMark(schema.marks.em)(v.state, v.dispatch, v),
    isActive: (v) => markActive(v, schema.marks.em),
  },
  {
    id: "strike",
    label: "خط‌خورده",
    icon: Strikethrough,
    run: (v) => toggleMark(schema.marks.strike)(v.state, v.dispatch, v),
    isActive: (v) => markActive(v, schema.marks.strike),
  },
  {
    id: "code",
    label: "کدِ درون‌خطی",
    icon: Code,
    shortcut: "Ctrl+`",
    run: (v) => toggleMark(schema.marks.code)(v.state, v.dispatch, v),
    isActive: (v) => markActive(v, schema.marks.code),
  },
  {
    id: "link",
    label: "لینک",
    icon: Link,
    shortcut: "Ctrl+K",
    // callback واقعی در `Toolbar` جایگزین می‌شود.
    run: () => undefined,
    isActive: (v) => markActive(v, schema.marks.link),
  },
  {
    id: "h1",
    startsGroup: true,
    label: "عنوانِ ۱",
    icon: Heading1,
    shortcut: "Ctrl+1",
    run: (v) => toggleHeading(1)(v.state, v.dispatch, v),
    isActive: (v) => blockActive(v, "heading", { level: 1 }),
  },
  {
    id: "h2",
    label: "عنوانِ ۲",
    icon: Heading2,
    shortcut: "Ctrl+2",
    run: (v) => toggleHeading(2)(v.state, v.dispatch, v),
    isActive: (v) => blockActive(v, "heading", { level: 2 }),
  },
  {
    id: "h3",
    label: "عنوانِ ۳",
    icon: Heading3,
    shortcut: "Ctrl+3",
    run: (v) => toggleHeading(3)(v.state, v.dispatch, v),
    isActive: (v) => blockActive(v, "heading", { level: 3 }),
  },
  {
    id: "ul",
    startsGroup: true,
    label: "فهرستِ نقطه‌ای",
    icon: List,
    shortcut: "Ctrl+Shift+8",
    run: (v) => wrapInList(schema.nodes.bullet_list)(v.state, v.dispatch),
  },
  {
    id: "ol",
    label: "فهرستِ شماره‌دار",
    icon: ListOrdered,
    shortcut: "Ctrl+Shift+7",
    run: (v) => wrapInList(schema.nodes.ordered_list)(v.state, v.dispatch),
  },
  {
    id: "task",
    label: "چک‌لیست",
    icon: ListChecks,
    shortcut: "Ctrl+Shift+X",
    run: (v) => toggleTaskList(v.state, v.dispatch),
    isActive: (v) => isTaskList(v.state),
  },
  {
    id: "quote",
    label: "نقلِ قول",
    icon: Quote,
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
    icon: SquareCode,
    shortcut: "Ctrl+Shift+K",
    run: (v) => setBlockType(schema.nodes.code_block)(v.state, v.dispatch),
    isActive: (v) => blockActive(v, "code_block"),
  },
  {
    id: "table",
    startsGroup: true,
    label: "جدول",
    icon: Table,
    run: (v) => insertTable(3, 3)(v.state, v.dispatch),
  },
  {
    id: "hr",
    label: "جداکننده",
    icon: Minus,
    run: (v) => v.dispatch(v.state.tr.replaceSelectionWith(schema.nodes.horizontal_rule.create())),
  },
  {
    id: "zwnj",
    label: "نیم‌فاصله",
    icon: Space,
    shortcut: "Shift+Space",
    run: (v) => insertZWNJ(v.state, v.dispatch, v),
  },
];

export function Toolbar({
  view,
  onToggleSource,
  sourceMode,
  onToggleFullscreen,
  fullscreen,
  onExportPdf,
  onEditLink,
  className,
}: ToolbarProps) {
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

  // ★ دکمه‌های اختیاری در انتها می‌آیند، و **فقط وقتی که callback
  // داده شده باشد**. دکمهٔ همیشه‌غیرفعال بدتر از دکمهٔ نبوده است.
  const items: Item[] = ITEMS
    .filter((item) => item.id !== "link" || onEditLink)
    .map((item) => ({ ...item }));

  const linkItem = items.find((item) => item.id === "link");
  if (linkItem && onEditLink) linkItem.run = () => onEditLink();

  if (onToggleSource) {
    items.push({
      id: "source",
      document: true,
      label: sourceMode ? "حالتِ ویرایش" : "حالتِ سورس",
      icon: FileCode,
      shortcut: "Ctrl+/",
      run: () => onToggleSource(),
      isActive: () => !!sourceMode,
    });
  }

  if (onExportPdf) {
    items.push({
      id: "pdf",
      document: true,
      label: "خروجیِ PDF",
      icon: Printer,
      shortcut: "Ctrl+P",
      run: () => onExportPdf(),
    });
  }

  if (onToggleFullscreen) {
    items.push({
      id: "fullscreen",
      document: true,
      label: fullscreen ? "خروج از تمام‌صفحه" : "تمام‌صفحه",
      icon: fullscreen ? Minimize2 : Maximize2,
      shortcut: "F11",
      run: () => onToggleFullscreen(),
      isActive: () => !!fullscreen,
    });
  }

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
        // اولین دکمهٔ سندی، بقیه را به لبهٔ دیگر هل می‌دهد.
        const firstDocument = item.document && !items[index - 1]?.document;
        return (
          <Fragment key={item.id}>
            {item.startsGroup ? (
              <span className="tm-toolbar-separator" role="separator" aria-orientation="vertical" />
            ) : null}
          <button
            key={item.id}
            type="button"
            className={[
              "tm-toolbar-button",
              item.document ? "tm-toolbar-button-doc" : "",
              // ★ فاصله‌گیر یک **حاشیه** است، نه عنصرِ جدا.
              //
              // نسخهٔ اول یک `<span>`ِ کشسان بود؛ در `flex-wrap` فضای
              // باقی‌مانده را **قبل از** محاسبهٔ شکستن می‌گرفت و آخرین
              // دکمه تنها به سطرِ دوم می‌افتاد — حتی وقتی جا بود.
              // `margin: auto` بعد از چیدمان اعمال می‌شود و این مشکل را
              // ندارد.
              firstDocument ? "tm-toolbar-button-first-doc" : "",
            ]
              .filter(Boolean)
              .join(" ")}
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
            <item.icon size={16} aria-hidden />
          </button>
          </Fragment>
        );
      })}
    </div>
  );
}
