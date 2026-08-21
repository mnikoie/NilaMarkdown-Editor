"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Selection } from "prosemirror-state";
import { useEditor } from "./useEditor.js";
import { OutlineTree } from "./Outline/OutlineTree.js";
import { Toolbar } from "./Toolbar/Toolbar.js";
import { SearchPanel } from "./SearchPanel/SearchPanel.js";
import { SlashMenu } from "./SlashMenu/SlashMenu.js";
import { LinkPopover } from "./LinkPopover/LinkPopover.js";
import { TableTools } from "./TableTools/TableTools.js";
import { ParagraphMenu } from "./ParagraphMenu/ParagraphMenu.js";
import { FormatMenu } from "./FormatMenu/FormatMenu.js";
import { ViewMenu } from "./ViewMenu/ViewMenu.js";
import { FileMenu } from "./FileMenu/FileMenu.js";
import { EditMenu } from "./EditMenu/EditMenu.js";
import { ImagePopover } from "./ImagePopover/ImagePopover.js";
import { ReferenceLinkPopover } from "./ReferenceLinkPopover/ReferenceLinkPopover.js";
import { computeStats } from "../core/stats.js";
import { exportPdf, type ExportPdfOptions } from "../core/export-pdf.js";
import { exportHtml } from "../core/export-html.js";
import { parse } from "../core/markdown/parse.js";
import { useFullscreen } from "./useFullscreen.js";
import { insertImageFiles, type PasteImageOptions } from "../core/plugins/paste-image.js";
import { selectedMarkdown } from "../core/commands/edit.js";
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

  /** نوارِ ابزار. `true` کامل است؛ `"compact"` فقط ابزارهای پرتکرار. */
  toolbar?: boolean | "compact";

  /**
   * منوی فرمان‌های بلوکیِ Paragraph در ردیفِ مستقلِ بالای نوار ابزار.
   * برای چیدمانِ سفارشیِ نرم‌افزار میزبان می‌توان آن را خاموش کرد و
   * `ParagraphMenu` را جداگانه استفاده کرد.
   */
  paragraphMenu?: boolean;

  /** منوی قالب‌بندیِ Typora؛ مثل Paragraph قابلِ حذف و جای‌گذاریِ مستقل است. */
  formatMenu?: boolean;

  /** منوی حالت‌های نمایشِ قابل‌انتقال به کامپوننت. */
  viewMenu?: boolean;

  /** منوی عملیاتِ سند: جدید، بازکردن، ذخیره و خروجی. */
  fileMenu?: boolean;

  /** منوی ویرایش: undo/redo، کلیپ‌بورد، انتخاب و جست‌وجو. */
  editMenu?: boolean;

  /** نامِ پیشنهادی هنگامِ ذخیرهٔ Markdown/HTML. */
  fileName?: string;

  /** عملیاتِ «بستن سند» فقط وقتی میزبان آن را پیاده کرده باشد نشان داده می‌شود. */
  onCloseDocument?: () => void;

  /** شمارشِ کلمه و زمانِ خواندن. */
  stats?: boolean;

  /** حالتِ تمرکز — بلوکِ فعال پررنگ، بقیه کم‌رنگ. */
  focusMode?: boolean;

  /** حالتِ ماشین‌تحریر — خطِ فعال وسطِ صفحه می‌ماند. */
  typewriterMode?: boolean;

  /**
   * بلوک‌های سنگین. `mermaid` پیش‌فرض خاموش است — کدِ دلخواه اجرا
   * می‌کند و اگر محتوا از کاربرِ دیگری بیاید، خطرِ امنیتی است.
   */
  features?: Features;

  /** لنگرهای بسته در آغاز، و اطلاع از تغییرشان — برای ذخیره. */
  foldedIds?: string[];
  onFoldChange?: (ids: string[]) => void;

  /**
   * دکمهٔ تمام‌صفحه در نوارِ ابزار، و میان‌برِ `F11`.
   *
   * پیش‌فرض روشن است ولی **فقط وقتی `toolbar` هم روشن باشد** دکمه‌ای
   * دیده می‌شود؛ میان‌بر همیشه کار می‌کند.
   */
  fullscreen?: boolean;

  /**
   * خروجیِ PDF — دکمه در نوارِ ابزار و میان‌برِ `Ctrl+P`.
   *
   * مقدارِ `false` خاموشش می‌کند (آن‌وقت `Ctrl+P` همان چاپِ عادیِ
   * مرورگر می‌ماند).
   */
  pdf?: boolean | ExportPdfOptions;

  /**
   * خمیرکردن و رهاکردنِ تصویر.
   *
   * بی هیچ تنظیمی کار می‌کند — تصویر `data:` می‌شود. برای آپلود،
   * `onUploadImage` بدهید.
   */
  images?: PasteImageOptions;

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
  paragraphMenu = true,
  formatMenu = true,
  viewMenu = true,
  fileMenu = true,
  editMenu = true,
  fileName = "document.md",
  onCloseDocument,
  stats = false,
  focusMode = false,
  typewriterMode = false,
  features,
  foldedIds,
  onFoldChange,
  fullscreen = true,
  pdf = true,
  images,
  className,
}: MarkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"live" | "source">("live");
  /** پیامِ کوتاه به کاربر — خطای آپلود یا شکستِ چاپ. */
  const [notice, setNotice] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchReplace, setSearchReplace] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [referenceLinkOpen, setReferenceLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [outlineVisible, setOutlineVisible] = useState(outline);
  const [statusVisible, setStatusVisible] = useState(stats);
  const [wordCountOpen, setWordCountOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [sourceText, setSourceText] = useState("");
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [documentFileName, setDocumentFileName] = useState(fileName);

  useEffect(() => setOutlineVisible(outline), [outline]);
  useEffect(() => setStatusVisible(stats), [stats]);
  useEffect(() => setDocumentFileName(fileName), [fileName]);

  const clampZoom = useCallback((value: number) => setZoom(Math.min(200, Math.max(50, value))), []);

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
    focusMode,
    typewriterMode,
    images: {
      ...images,
      onError: (message) => {
        setNotice(message);
        images?.onError?.(message);
      },
    },
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
    onEditLink: () => setLinkOpen(true),
    onToggleOutline: () => setOutlineVisible((visible) => !visible),
    onActualSize: () => clampZoom(100),
    onZoomIn: () => setZoom((value) => Math.min(200, value + 10)),
    onZoomOut: () => setZoom((value) => Math.max(50, value - 10)),
  });

  const handleRef = useRef(handle);
  handleRef.current = handle;

  const currentMarkdown = useCallback(
    () =>
      mode === "source"
        ? (sourceRef.current?.value ?? sourceText)
        : handleRef.current.getMarkdown(),
    [mode, sourceText],
  );

  const replaceDocument = useCallback((markdown: string) => {
    handleRef.current.setMarkdown(markdown);
    setSourceText(markdown);
    if (sourceRef.current) sourceRef.current.value = markdown;
  }, []);

  const saveMarkdown = useCallback(() => {
    downloadText(currentMarkdown(), documentFileName, "text/markdown;charset=utf-8");
  }, [currentMarkdown, documentFileName]);

  const saveHtml = useCallback(() => {
    const html = exportHtml(parse(currentMarkdown()), {
      directives,
      dir: dir === "auto" ? "rtl" : dir,
      standalone: true,
    });
    downloadText(html, replaceExtension(documentFileName, ".html"), "text/html;charset=utf-8");
  }, [currentMarkdown, directives, dir, documentFileName]);

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

  const fs = useFullscreen(() => rootRef.current);

  const runExportPdf = useCallback(() => {
    const opts = typeof pdf === "object" ? pdf : {};
    void exportPdf(parse(currentMarkdown()), {
      directives,
      dir: dir === "auto" ? "rtl" : dir,
      ...opts,
    }).then((r) => {
      if (!r.ok) setNotice(r.reason ?? "خروجیِ PDF شکست خورد.");
    });
  }, [pdf, directives, dir, currentMarkdown]);

  /**
   * میان‌برها.
   *
   * ★ روی خودِ ریشه، نه `document`: ادیتوری که در گوشهٔ صفحه است نباید
   * `F11`ِ کلِ برنامه را بدزدد.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onKey = (e: KeyboardEvent) => {
      if (fullscreen && e.key === "F11") {
        e.preventDefault();
        fs.toggle();
        return;
      }
      if (pdf !== false && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        runExportPdf();
        return;
      }
      if (
        editMenu &&
        mode === "live" &&
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "c"
      ) {
        const view = handleRef.current.view;
        const markdown = view ? selectedMarkdown(view.state) : "";
        if (markdown) {
          e.preventDefault();
          void navigator.clipboard
            .writeText(markdown)
            .catch(() => setNotice("دسترسی به کلیپ‌بورد ممکن نشد."));
        }
        return;
      }
      if (fileMenu && (e.ctrlKey || e.metaKey)) {
        const key = e.key.toLowerCase();
        if (key === "n") {
          e.preventDefault();
          replaceDocument("");
        } else if (key === "o") {
          e.preventDefault();
          documentInputRef.current?.click();
        } else if (key === "s") {
          e.preventDefault();
          saveMarkdown();
        }
      }
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [fullscreen, pdf, fs, runExportPdf, fileMenu, editMenu, mode, replaceDocument, saveMarkdown]);

  /** پیام پس از چند ثانیه خودش می‌رود — کاربر نباید ببنددش. */
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const onToggleFoldNode = useCallback((node: OutlineNode) => {
    const view = handleRef.current.view;
    if (!view) return;
    toggleFold(node.id)(view.state, view.dispatch);
    setFolded(new Set(foldKey.getState(view.state)?.folded ?? []));
  }, []);

  return (
    <div
      ref={rootRef}
      className={`tm-root ${className ?? ""}`}
      data-theme={theme === "auto" ? undefined : theme}
      data-fullscreen={fs.active ? (fs.soft ? "soft" : "real") : undefined}
      dir={dir === "auto" ? undefined : dir}
      style={{ "--tm-content-zoom": zoom / 100 } as CSSProperties}
    >
      {outlineVisible ? (
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
          <div className="tm-editor-controls">
            {fileMenu || editMenu || paragraphMenu || formatMenu || viewMenu ? (
              <div className="tm-top-menu-row">
                {fileMenu ? (
                  <FileMenu
                    onNew={() => replaceDocument("")}
                    onOpen={() => documentInputRef.current?.click()}
                    onSave={saveMarkdown}
                    onSaveAs={saveMarkdown}
                    onExportHtml={saveHtml}
                    onExportPdf={pdf !== false ? runExportPdf : undefined}
                    onClose={onCloseDocument}
                  />
                ) : null}
                {editMenu ? (
                  <EditMenu
                    view={mode === "live" ? handle.view : null}
                    onFind={() => {
                      setSearchReplace(false);
                      setSearchOpen(true);
                    }}
                    onReplace={() => {
                      setSearchReplace(true);
                      setSearchOpen(true);
                    }}
                    onNotice={setNotice}
                  />
                ) : null}
                {paragraphMenu ? (
                  <ParagraphMenu
                    view={mode === "live" ? handle.view : null}
                    onInsertReferenceLink={() => setReferenceLinkOpen(true)}
                    onNotice={setNotice}
                  />
                ) : null}
                {formatMenu ? (
                  <FormatMenu
                    view={mode === "live" ? handle.view : null}
                    onEditLink={() => setLinkOpen(true)}
                    onInsertImage={() => setImageOpen(true)}
                    onInsertLocalImage={() => imageInputRef.current?.click()}
                    onNotice={setNotice}
                  />
                ) : null}
                {viewMenu ? (
                  <ViewMenu
                    view={handle.view}
                    outlineVisible={outlineVisible}
                    onToggleOutline={() => setOutlineVisible((visible) => !visible)}
                    sourceMode={mode === "source"}
                    onToggleSource={toggleSource}
                    statusVisible={statusVisible}
                    onToggleStatus={() => setStatusVisible((visible) => !visible)}
                    wordCountOpen={wordCountOpen}
                    onToggleWordCount={() => setWordCountOpen((visible) => !visible)}
                    onSearch={() => {
                      setSearchReplace(false);
                      setSearchOpen(true);
                    }}
                    fullscreen={fs.active}
                    onToggleFullscreen={fullscreen ? fs.toggle : undefined}
                    zoom={zoom}
                    onZoom={clampZoom}
                  />
                ) : null}
              </div>
            ) : null}
            <Toolbar
              view={handle.view}
              compact={toolbar === "compact"}
              onToggleSource={toggleSource}
              sourceMode={mode === "source"}
              onToggleFullscreen={fullscreen ? fs.toggle : undefined}
              fullscreen={fs.active}
              onExportPdf={pdf !== false ? runExportPdf : undefined}
              onEditLink={() => setLinkOpen(true)}
            />
          </div>
        ) : null}

        <LinkPopover view={handle.view} open={linkOpen} onClose={() => setLinkOpen(false)} />
        <ReferenceLinkPopover
          view={handle.view}
          open={referenceLinkOpen}
          onClose={() => setReferenceLinkOpen(false)}
        />
        <ImagePopover view={handle.view} open={imageOpen} onClose={() => setImageOpen(false)} />
        <input
          ref={documentInputRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          hidden
          aria-hidden="true"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            void file
              .text()
              .then((markdown) => {
                replaceDocument(markdown);
                setDocumentFileName(file.name);
              })
              .catch(() => setNotice("خواندنِ فایل ممکن نشد."));
          }}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-hidden="true"
          onChange={(event) => {
            const files = [...(event.currentTarget.files ?? [])];
            event.currentTarget.value = "";
            if (!handle.view || files.length === 0) return;
            void insertImageFiles(handle.view, files, {
              ...images,
              onError: (message) => {
                setNotice(message);
                images?.onError?.(message);
              },
            });
          }}
        />
        <TableTools view={handle.view} active={handle.inTable} enabled={mode === "live"} />

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

        {wordCountOpen ? <StatsPopover view={handle.view} onClose={() => setWordCountOpen(false)} /> : null}
        {statusVisible ? <StatsBar view={handle.view} /> : null}

        {/* ★ `role="status"` تا صفحه‌خوان هم بشنود — بندِ ۱۲. */}
        {notice ? (
          <div className="tm-notice" role="status" aria-live="polite">
            {notice}
          </div>
        ) : null}
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

function replaceExtension(fileName: string, extension: string): string {
  const base = fileName.replace(/\.[^.]+$/, "") || "document";
  return `${base}${extension}`;
}

function downloadText(text: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function StatsPopover({
  view,
  onClose,
}: {
  view: import("prosemirror-view").EditorView | null;
  onClose: () => void;
}) {
  const stats = view ? computeStats(view.state.doc) : null;
  if (!stats) return null;
  return (
    <aside className="tm-word-count-popover" aria-label="شمارش کلمات">
      <StatsBar view={view} />
      <button type="button" onClick={onClose} aria-label="بستن شمارش کلمات">×</button>
    </aside>
  );
}
