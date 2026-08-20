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
import { tableEditingPlugin } from "../core/commands/table.js";
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
  /** روشن/خاموش‌کردنِ بلوک‌های سنگین. */
  features?: Features;
}

export interface EditorHandle {
  view: EditorView | null;
  outline: OutlineNode[];
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
    features,
  } = options;

  const viewRef = useRef<EditorView | null>(null);
  const mountRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** آخرین مارک‌داونی که خودمان تولید کرده‌ایم — برای قاعدهٔ ۲. */
  const lastEmitted = useRef<string>(value ?? defaultValue);
  const [outline, setOutline] = useState<OutlineNode[]>([]);

  // پارامترهایی که در callbackها استفاده می‌شوند ولی نباید ادیتور را
  // بازسازی کنند.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onFoldChangeRef = useRef(onFoldChange);
  onFoldChangeRef.current = onFoldChange;
  const onToggleSourceRef = useRef(onToggleSource);
  onToggleSourceRef.current = onToggleSource;

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
        keymapPlugin({ onToggleSource: () => onToggleSourceRef.current?.() }),
        inputRulesPlugin(directives),
        livePreviewPlugin(),
        foldPlugin({
          registry: directives,
          initial: foldedIds,
          onChange: (ids) => onFoldChangeRef.current?.(ids),
        }),
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
  }, [directives, debounceMs, readOnly, features]);

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
