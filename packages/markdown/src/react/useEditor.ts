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
import { livePreviewPlugin } from "../core/plugins/live-preview.js";
import { foldPlugin } from "../core/plugins/fold.js";
import { inputRulesPlugin } from "../core/plugins/input-rules.js";
import { keymapPlugin } from "../core/plugins/keymap.js";
import { isInTable, tableEditingPlugin, tableResizingPlugin } from "../core/commands/table.js";
import { searchPlugin } from "../core/plugins/search.js";
import { slashMenuPlugin } from "../core/plugins/slash-menu.js";
import { writingModesPlugin } from "../core/plugins/writing-modes.js";
import { pasteImagePlugin, type PasteImageOptions } from "../core/plugins/paste-image.js";
import { autoPairPlugin } from "../core/plugins/auto-pair.js";
import { taskListPlugin } from "../core/plugins/task-list.js";
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
  onFoldChange?: (ids: string[]) => void;
  onToggleSource?: () => void;
  onSearch?: () => void;
  onReplace?: () => void;
  onEditLink?: () => void;
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
    onFoldChange,
    onToggleSource,
    onSearch,
    onReplace,
    onEditLink,
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
  // ★ در وابستگی‌های ادیتور نیست: یک آبجکتِ نو در هر رندر، ادیتور را
  // بازمی‌ساخت و مکان‌نما را می‌پراند.
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const ref = (node: HTMLElement | null) => {
    mountRef.current = node;
  };

  useLayoutEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const state = EditorState.create({
      doc: parse(value ?? defaultValue),
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
        }),
        inputRulesPlugin(directives),
        autoPairPlugin(),
        livePreviewPlugin(),
        foldPlugin({
          registry: directives,
          initial: foldedIds,
          onChange: (ids) => onFoldChangeRef.current?.(ids),
        }),
        searchPlugin(),
        writingModesPlugin({ focus: focusMode, typewriter: typewriterMode }),
        // ★ باید **قبل از** `dropCursor` بیاید: هر دو `handleDrop` دارند
        // و اولی که `true` برگرداند رویداد را مصرف می‌کند. با ترتیبِ
        // برعکس، رهاکردنِ عکس فقط مکان‌نما را جابه‌جا می‌کرد.
        pasteImagePlugin(imagesRef.current ?? {}),
        taskListPlugin(),
        tableResizingPlugin(),
        tableEditingPlugin(),
        dropCursor(),
        gapCursor(),
      ],
    });

    const view = new EditorView(mount, {
      state,
      editable: () => !readOnly,
      nodeViews: createNodeViews(directives, features),
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "ویرایشگرِ متن",
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
      view.destroy();
      viewRef.current = null;
    };
    // `value` عمداً در وابستگی‌ها نیست — تغییرش سند را بازسازی نمی‌کند.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directives, debounceMs, readOnly, features, focusMode, typewriterMode]);

  /** حالتِ کنترل‌شده — فقط وقتی `value` از بیرون واقعاً فرق کرده. */
  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === undefined) return;
    if (value === lastEmitted.current) return; // قاعدهٔ ۲

    const doc = parse(value);
    lastEmitted.current = value;
    view.dispatch(
      view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content).setMeta("addToHistory", false),
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
      const doc = parse(md);
      lastEmitted.current = md;
      view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content));
    },
    focus: () => viewRef.current?.focus(),
  };

  return { ref, handle };
}
