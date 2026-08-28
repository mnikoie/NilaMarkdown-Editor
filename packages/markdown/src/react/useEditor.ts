"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history } from "prosemirror-history";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { schema } from "../core/schema/index.js";
import { parse } from "../core/markdown/parse.js";
import { serialize } from "../core/markdown/serialize.js";
import { foldPlugin, type FoldingOptions } from "../core/plugins/fold.js";
import { inputRulesPlugin } from "../core/plugins/input-rules.js";
import { keymapPlugin } from "../core/plugins/keymap.js";
import { isInTable, tableEditingPlugin, tableResizingPlugin } from "../core/commands/table.js";
import { searchPlugin } from "../core/plugins/search.js";
import { slashMenuPlugin } from "../core/plugins/slash-menu.js";
import { writingModesPlugin } from "../core/plugins/writing-modes.js";
import { pasteImagePlugin, type PasteImageOptions } from "../core/plugins/paste-image.js";
import { autoPairPlugin } from "../core/plugins/auto-pair.js";
import { taskListPlugin } from "../core/plugins/task-list.js";
import { listFoldPlugin } from "../core/plugins/list-fold.js";
import { textDirectionPlugin, type TextDirection } from "../core/plugins/text-direction.js";
import { emojiShortnamePlugin } from "../core/plugins/emoji.js";
import { createNodeViews } from "../node-views/index.js";
import type { Features } from "../node-views/index.js";
import { buildOutline } from "../core/outline/build.js";
import { BUILTIN_MARKS } from "../core/directives/builtin.js";
import type { MarkRegistry } from "../core/directives/types.js";
import type { OutlineNode } from "../core/outline/types.js";

export interface UseEditorOptions {
  value?: string;
  defaultValue?: string;
  onChange?: (markdown: string) => void;
  /** فاصلهٔ صداکردنِ onChange. پیش‌فرض ۳۰۰. */
  debounceMs?: number;
  readOnly?: boolean;
  directives?: MarkRegistry;
  foldedIds?: string[];
  folding?: FoldingOptions | false;
  locale?: "fa" | "en";
  dir?: TextDirection;
  onFoldChange?: (ids: string[]) => void;
  onToggleSource?: () => void;
  onSearch?: () => void;
  onReplace?: () => void;
  onEditLink?: () => void;
  onToggleOutline?: () => void;
  onActualSize?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  /** روشن/خاموش‌کردنِ بلوک‌های سنگین. */
  features?: Features;
  /** حالتِ تمرکز (بلوکِ فعال پررنگ، بقیه کم‌رنگ). */
  focusMode?: boolean;
  /** حالتِ ماشین‌تحریر (خطِ فعال وسطِ صفحه). */
  typewriterMode?: boolean;
  /** خمیرکردن و رهاکردنِ تصویر. */
  images?: PasteImageOptions;
}

export interface EditorHandle {
  view: EditorView | null;
  outline: OutlineNode[];
  inTable: boolean;
  getMarkdown: () => string;
  setMarkdown: (md: string) => void;
  focus: () => void;
}

/**
 * چسبِ بینِ React و ProseMirror.
 *
 * ★ دو قاعدهٔ رفتاریِ بندِ ۸ که اینجا رعایت می‌شوند:
 *
 * ۱. `onChange` در هر ضربهٔ کلید صدا نمی‌شود. سریالایزِ سندِ بزرگ ارزان
 *    نیست و در فایلِ چندهزارخطی تایپ را کند می‌کند.
 *
 * ۲. در حالتِ کنترل‌شده، `value`ی که خودمان تولید کرده‌ایم سند را بازسازی
 *    نمی‌کند — وگرنه مکان‌نما با هر حرف به اولِ سند می‌پرد. آخرین مقدارِ
 *    سریالایزشده نگه داشته می‌شود و اگر `value` با آن یکی بود، دست به
 *    سند نمی‌خورد.
 */
export function useEditor(options: UseEditorOptions): {
  ref: (node: HTMLElement | null) => void;
  handle: EditorHandle;
} {
  const {
    value,
    defaultValue = "",
    onChange,
    debounceMs = 300,
    readOnly = false,
    directives = BUILTIN_MARKS,
    foldedIds,
    folding,
    locale = "fa",
    dir = "auto",
    onFoldChange,
    onToggleSource,
    onSearch,
    onReplace,
    onEditLink,
    onToggleOutline,
    onActualSize,
    onZoomIn,
    onZoomOut,
    features,
    focusMode,
    typewriterMode,
    images,
  } = options;

  const viewRef = useRef<EditorView | null>(null);
  const mountRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** آخرین مارک‌داونی که خودمان تولید کرده‌ایم — برای قاعدهٔ ۲. */
  const lastEmitted = useRef<string>(value ?? defaultValue);
  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [inTable, setInTable] = useState(false);

  // پارامترهایی که در callbackها استفاده می‌شوند ولی نباید ادیتور را
  // بازسازی کنند.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onFoldChangeRef = useRef(onFoldChange);
  onFoldChangeRef.current = onFoldChange;
  const onToggleSourceRef = useRef(onToggleSource);
  onToggleSourceRef.current = onToggleSource;
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  const onReplaceRef = useRef(onReplace);
  onReplaceRef.current = onReplace;
  const onEditLinkRef = useRef(onEditLink);
  onEditLinkRef.current = onEditLink;
  const onToggleOutlineRef = useRef(onToggleOutline);
  onToggleOutlineRef.current = onToggleOutline;
  const onActualSizeRef = useRef(onActualSize);
  onActualSizeRef.current = onActualSize;
  const onZoomInRef = useRef(onZoomIn);
  onZoomInRef.current = onZoomIn;
  const onZoomOutRef = useRef(onZoomOut);
  onZoomOutRef.current = onZoomOut;
  // ★ در وابستگی‌های ادیتور نیست: یک آبجکتِ نو در هر رندر، ادیتور را
  // بازمی‌ساخت و مکان‌نما را می‌پراند.
  const imagesRef = useRef(images);
  imagesRef.current = images;
  // آکاردئون خاموش — کارتِ دایرکتیو هم باید هم‌سطح‌ها را نبندد.
  const foldModeRef = useRef<"accordion" | "multiple">("multiple");
  foldModeRef.current = "multiple";
  const foldingInteractive = folding !== false;

  const ref = (node: HTMLElement | null) => {
    mountRef.current = node;
  };

  useLayoutEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const doc = parse(lastEmitted.current, { linkify: features?.linkify !== false });
    const state = EditorState.create({
      doc,
      schema,
      plugins: [
        history(),

        // ★ منوی `/` باید **قبل از** keymap بیاید.
        //
        // ProseMirror افزونه‌ها را به ترتیب صدا می‌زند و اولی که `true`
        // برگرداند، کلید را مصرف می‌کند. اگر keymap جلوتر باشد، `Enter`
        // را `splitListItem`/`baseKeymap` می‌گیرد و منو هرگز آیتم را
        // درج نمی‌کند — دقیقاً همان چیزی که در مرورگر دیدیم: منو بسته
        // می‌شد ولی `/جدول` سرِ جایش می‌ماند.
        slashMenuPlugin({ registry: directives }),

        keymapPlugin({
          onToggleSource: () => onToggleSourceRef.current?.(),
          onSearch: () => onSearchRef.current?.(),
          onReplace: () => onReplaceRef.current?.(),
          onEditLink: () => onEditLinkRef.current?.(),
          onToggleOutline: () => onToggleOutlineRef.current?.(),
          onActualSize: () => onActualSizeRef.current?.(),
          onZoomIn: () => onZoomInRef.current?.(),
          onZoomOut: () => onZoomOutRef.current?.(),
        }),
        inputRulesPlugin(directives),
        autoPairPlugin(),
        // ★ کاربر تاشدن را کلاً نمی‌خواهد — هیچ گره‌ای نباید بسته
        //   شروع شود، صرف‌نظر از ورودیِ `folding`/`foldedIds`ِ مصرف‌کننده.
        //   دکمهٔ فلش هم در index.css با display:none پنهان است تا
        //   کاربر نتواند دوباره ببندد؛ خودِ پلاگین دست‌نخورده می‌ماند
        //   تا برگرداندنِ این تصمیم فقط لغوِ همین دو خط باشد.
        foldPlugin({
          registry: directives,
          initial: [],
          // آکاردئون هم خاموش — فقط initial کافی نبود چون
          // reconcileAccordion با هر setMode می‌تواند هم‌سطح‌ها را ببندد.
          mode: "multiple",
          locale,
          interactive: foldingInteractive ? undefined : false,
          onChange: (ids) => onFoldChangeRef.current?.(ids),
        }),
        searchPlugin(),
        textDirectionPlugin(dir),
        writingModesPlugin({ focus: focusMode, typewriter: typewriterMode }),
        // ★ باید **قبل از** `dropCursor` بیاید: هر دو `handleDrop` دارند
        // و اولی که `true` برگرداند رویداد را مصرف می‌کند. با ترتیبِ
        // برعکس، رهاکردنِ عکس فقط مکان‌نما را جابه‌جا می‌کرد.
        pasteImagePlugin(imagesRef.current ?? {}),
        ...(features?.taskList === false ? [] : [taskListPlugin({ locale })]),
        ...(features?.emoji ? [emojiShortnamePlugin()] : []),
        // ★ همان تصمیم: لیست‌های تودرتو هم باز شروع می‌شوند.
        ...(foldingInteractive
          ? [
              listFoldPlugin({
                initial: "expanded",
                mode: "multiple",
                locale,
              }),
            ]
          : []),
        tableResizingPlugin(),
        tableEditingPlugin(),
        dropCursor(),
        gapCursor(),
      ],
    });

    const view = new EditorView(mount, {
      state,
      editable: () => !readOnly,
      nodeViews: createNodeViews(directives, features, {
        // ★ همان تصمیم: کارتِ دایرکتیو هم باز شروع می‌شود، صرف‌نظر
        //   از `folding.initial`ِ ورودی.
        folding: {
          ...(folding === false ? {} : folding),
          initial: "expanded",
        },
        foldingInteractive: foldingInteractive ? undefined : false,
        cardFolding: { mode: () => foldModeRef.current },
        locale,
      }),
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": locale === "en" ? "Text Editor" : "ویرایشگرِ متن",
        class: "tm-editor",
      },
      dispatchTransaction(tr) {
        const next = view.state.apply(tr);
        view.updateState(next);

        if (tr.selectionSet || tr.docChanged) setInTable(isInTable(next));

        if (tr.docChanged) {
          setOutline(buildOutline(next.doc, directives));

          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            const md = serialize(next.doc);
            lastEmitted.current = md;
            onChangeRef.current?.(md);
          }, debounceMs);
        }
      },
    });

    viewRef.current = view;
    setOutline(buildOutline(state.doc, directives));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      lastEmitted.current = serialize(view.state.doc);
      view.destroy();
      viewRef.current = null;
    };
    // `value` عمداً در وابستگی‌ها نیست — تغییرش سند را بازسازی نمی‌کند.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directives, debounceMs, readOnly, features, focusMode, typewriterMode, locale, dir, foldingInteractive]);

  /** حالتِ کنترل‌شده — فقط وقتی `value` از بیرون واقعاً فرق کرده. */
  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === undefined) return;
    if (value === lastEmitted.current) return; // قاعدهٔ ۲

    const doc = parse(value, { linkify: features?.linkify !== false });
    lastEmitted.current = value;
    view.dispatch(
      view.state.tr
        .replaceWith(0, view.state.doc.content.size, doc.content)
        .setDocAttribute("lineEnding", doc.attrs.lineEnding)
        .setMeta("addToHistory", false),
    );
  }, [value]);

  const handle: EditorHandle = {
    get view() {
      return viewRef.current;
    },
    outline,
    inTable,
    getMarkdown: () => (viewRef.current ? serialize(viewRef.current.state.doc) : lastEmitted.current),
    setMarkdown: (md: string) => {
      const view = viewRef.current;
      if (!view) return;
      const doc = parse(md, { linkify: features?.linkify !== false });
      lastEmitted.current = md;
      view.dispatch(
        view.state.tr
          .replaceWith(0, view.state.doc.content.size, doc.content)
          .setDocAttribute("lineEnding", doc.attrs.lineEnding),
      );
    },
    focus: () => viewRef.current?.focus(),
  };

  return { ref, handle };
}
