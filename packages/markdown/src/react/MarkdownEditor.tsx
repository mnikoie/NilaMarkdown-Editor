"use client";

import { useCallback, useRef, useState } from "react";
import { Selection } from "prosemirror-state";
import { useEditor } from "./useEditor.js";
import { OutlineTree } from "./Outline/OutlineTree.js";
import { Toolbar } from "./Toolbar/Toolbar.js";
import { SearchPanel } from "./SearchPanel/SearchPanel.js";
import { SlashMenu } from "./SlashMenu/SlashMenu.js";
import { computeStats } from "../core/stats.js";
import { foldKey, toggleFold } from "../core/plugins/fold.js";
import { BUILTIN_MARKS } from "../core/directives/builtin.js";
import type { MarkRegistry } from "../core/directives/types.js";
import type { OutlineNode } from "../core/outline/types.js";
import type { Features } from "../node-views/index.js";

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

  /** نوارِ ابزار. */
  toolbar?: boolean;

  /** شمارشِ کلمه و زمانِ خواندن. */
  stats?: boolean;

  /**
   * بلوک‌های سنگین. `mermaid` پیش‌فرض خاموش است — کدِ دلخواه اجرا
   * می‌کند و اگر محتوا از کاربرِ دیگری بیاید، خطرِ امنیتی است.
   */
  features?: Features;

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
  toolbar = false,
  stats = false,
  features,
  foldedIds,
  onFoldChange,
  className,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<"live" | "source">("live");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchReplace, setSearchReplace] = useState(false);
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
    features,
    foldedIds,
    onFoldChange: (ids) => {
      setFolded(new Set(ids));
      onFoldChange?.(ids);
    },
    onToggleSource: toggleSource,
    onSearch: () => {
      setSearchReplace(false);
      setSearchOpen(true);
    },
    onReplace: () => {
      setSearchReplace(true);
      setSearchOpen(true);
    },
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

  /**
   * حالتِ تاشدگی داخلِ ProseMirror زندگی می‌کند، نه در React. پس React
   * از تغییرش خبردار نمی‌شود و پنلِ کناری با `aria-expanded`ِ کهنه
   * می‌ماند. این نسخهٔ آینه‌ایِ آن است تا رندرِ دوباره اتفاق بیفتد.
   */
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set(foldedIds ?? []));

  const onToggleFoldNode = useCallback((node: OutlineNode) => {
    const view = handleRef.current.view;
    if (!view) return;
    toggleFold(node.id)(view.state, view.dispatch);
    setFolded(new Set(foldKey.getState(view.state)?.folded ?? []));
  }, []);

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
            folded={folded}
            onNavigate={onNavigate}
            onToggleFold={onToggleFoldNode}
          />
        </aside>
      ) : null}

      <div className="tm-main">
        <SearchPanel
          view={handle.view}
          open={searchOpen}
          withReplace={searchReplace}
          onClose={() => setSearchOpen(false)}
        />

        {toolbar ? (
          <Toolbar
            view={handle.view}
            onToggleSource={toggleSource}
            sourceMode={mode === "source"}
          />
        ) : null}

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

        {/* ظرفِ نسبی تا منو کنارِ مکان‌نما بنشیند */}
        <div className="tm-editor-wrap">
          <SlashMenu view={handle.view} />
          <div
          ref={ref}
          className="tm-editor-mount"
          data-placeholder={placeholder}
          hidden={mode === "source"}
          />
        </div>

        {stats ? <StatsBar view={handle.view} /> : null}
      </div>
    </div>
  );
}

/** نوارِ آمار — کلمه، کاراکتر، زمانِ خواندن. */
function StatsBar({ view }: { view: import("prosemirror-view").EditorView | null }) {
  const s = view ? computeStats(view.state.doc) : null;
  if (!s) return null;
  const fa = (n: number) => n.toLocaleString("fa-IR");
  return (
    <div className="tm-stats" aria-live="polite">
      <span>{fa(s.words)} کلمه</span>
      <span>{fa(s.characters)} کاراکتر</span>
      <span>~{fa(s.readingMinutes)} دقیقه خواندن</span>
    </div>
  );
}
