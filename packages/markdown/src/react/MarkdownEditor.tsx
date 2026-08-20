"use client";

import { useCallback, useRef, useState } from "react";
import { Selection } from "prosemirror-state";
import { useEditor } from "./useEditor.js";
import { OutlineTree } from "./Outline/OutlineTree.js";
import { foldKey, toggleFold } from "../core/plugins/fold.js";
import { BUILTIN_MARKS } from "../core/directives/builtin.js";
import type { MarkRegistry } from "../core/directives/types.js";
import type { OutlineNode } from "../core/outline/types.js";

export interface MarkdownEditorProps {
  /** حالتِ کنترل‌شده. */
  value?: string;
  /** حالتِ کنترل‌نشده. فقط بارِ اول خوانده می‌شود. */
  defaultValue?: string;
  onChange?: (markdown: string) => void;
  debounceMs?: number;

  readOnly?: boolean;
  placeholder?: string;

  theme?: "light" | "dark" | "auto";
  dir?: "rtl" | "ltr" | "auto";

  /** تعریفِ مارک‌های سفارشی. از دیتابیس می‌آید. */
  directives?: MarkRegistry;

  /** پنلِ ساختار. */
  outline?: boolean;

  /** لنگرهای بسته در آغاز، و اطلاع از تغییرشان — برای ذخیره. */
  foldedIds?: string[];
  onFoldChange?: (ids: string[]) => void;

  className?: string;
}

/**
 * ویرایشگرِ Markdown با پیش‌نمایشِ زنده.
 *
 * در Next.js حتماً `"use client"` لازم دارد و باید CSS را import کنی:
 * ```ts
 * import "@tamin/markdown/styles.css";
 * ```
 */
export function MarkdownEditor({
  value,
  defaultValue = "",
  onChange,
  debounceMs = 300,
  readOnly = false,
  placeholder,
  theme = "auto",
  dir = "auto",
  directives = BUILTIN_MARKS,
  outline = false,
  foldedIds,
  onFoldChange,
  className,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<"live" | "source">("live");
  const [sourceText, setSourceText] = useState("");
  const sourceRef = useRef<HTMLTextAreaElement>(null);

  const toggleSource = useCallback(() => {
    setMode((current) => {
      if (current === "live") {
        setSourceText(handleRef.current?.getMarkdown() ?? "");
        return "source";
      }
      handleRef.current?.setMarkdown(sourceRef.current?.value ?? "");
      return "live";
    });
  }, []);

  const { ref, handle } = useEditor({
    value,
    defaultValue,
    onChange,
    debounceMs,
    readOnly,
    directives,
    foldedIds,
    onFoldChange,
    onToggleSource: toggleSource,
  });

  const handleRef = useRef(handle);
  handleRef.current = handle;

  const onNavigate = useCallback((node: OutlineNode) => {
    const view = handleRef.current.view;
    if (!view) return;
    const { state } = view;
    // `Selection.near` نزدیک‌ترین جای معتبر را پیدا می‌کند — گرهِ ساختار
    // ممکن است atom باشد و مکان‌نما مستقیم داخلش ننشیند.
    const pos = Math.min(node.from + 1, state.doc.content.size);
    const selection = Selection.near(state.doc.resolve(pos));
    view.dispatch(state.tr.setSelection(selection).scrollIntoView());
    view.focus();
  }, []);

  const onToggleFoldNode = useCallback((node: OutlineNode) => {
    const view = handleRef.current.view;
    if (!view) return;
    toggleFold(node.id)(view.state, view.dispatch);
  }, []);

  const foldedSet = handle.view ? foldKey.getState(handle.view.state)?.folded : undefined;

  return (
    <div
      className={`tm-root ${className ?? ""}`}
      data-theme={theme === "auto" ? undefined : theme}
      dir={dir === "auto" ? undefined : dir}
    >
      {outline ? (
        <aside className="tm-sidebar" aria-label="پنلِ ساختار">
          <OutlineTree
            nodes={handle.outline}
            folded={foldedSet}
            onNavigate={onNavigate}
            onToggleFold={onToggleFoldNode}
          />
        </aside>
      ) : null}

      <div className="tm-main">
        {/* حالتِ سورس: یک textarea با فونتِ mono کافی است — CodeMirror لازم نیست. */}
        {mode === "source" ? (
          <textarea
            ref={sourceRef}
            className="tm-source"
            defaultValue={sourceText}
            readOnly={readOnly}
            dir="ltr"
            spellCheck={false}
            aria-label="متنِ خامِ مارک‌داون"
          />
        ) : null}

        <div
          ref={ref}
          className="tm-editor-mount"
          data-placeholder={placeholder}
          hidden={mode === "source"}
        />
      </div>
    </div>
  );
}
