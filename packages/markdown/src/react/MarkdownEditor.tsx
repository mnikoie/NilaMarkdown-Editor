"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { Menu } from "lucide-react";
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
import { InsertMenu } from "./InsertMenu/InsertMenu.js";
import { ImagePopover } from "./ImagePopover/ImagePopover.js";
import { ReferenceLinkPopover } from "./ReferenceLinkPopover/ReferenceLinkPopover.js";
import { computeStats } from "../core/stats.js";
import { exportPdf, type ExportPdfOptions } from "../core/export-pdf.js";
import { exportHtml } from "../core/export-html.js";
import { parse } from "../core/markdown/parse.js";
import { serialize } from "../core/markdown/serialize.js";
import { useFullscreen } from "./useFullscreen.js";
import { insertImageFiles, type PasteImageOptions } from "../core/plugins/paste-image.js";
import { selectedMarkdown } from "../core/commands/edit.js";
import {
  foldAll,
  foldKey,
  setFoldMode,
  toggleFoldPreservingScroll,
  unfoldAll,
  type FoldingOptions,
} from "../core/plugins/fold.js";
import {
  foldAllListNodes,
  setListFoldMode,
  unfoldAllListNodes,
} from "../core/plugins/list-fold.js";
import { BUILTIN_MARKS } from "../core/directives/builtin.js";
import type { MarkRegistry } from "../core/directives/types.js";
import { flattenOutline } from "../core/outline/build.js";
import type { OutlineNode } from "../core/outline/types.js";
import type { Features } from "../node-views/index.js";
import {
  MarkdownI18nProvider,
  translate,
  useMarkdownI18n,
  type MarkdownLocale,
} from "./i18n.js";

type MarkdownWritable = {
  write(data: string | Blob): Promise<void>;
  close(): Promise<void>;
};

type MarkdownFileHandle = FileSystemFileHandle & {
  createWritable(): Promise<MarkdownWritable>;
};

type FilePickerWindow = Window & {
  showOpenFilePicker?: (options?: unknown) => Promise<MarkdownFileHandle[]>;
  showSaveFilePicker?: (options?: unknown) => Promise<MarkdownFileHandle>;
};

export type ContentWidth = "auto" | "full" | "wide" | "large" | "medium" | "small" | "tiny";
type CustomThemeColors = { accent: string; background: string; foreground: string };
type FilePreferences = {
  confirmBeforeDiscard: boolean;
  watchExternalChanges: boolean;
  restoreScrollPosition: boolean;
};

const DEFAULT_FILE_PREFERENCES: FilePreferences = {
  confirmBeforeDiscard: true,
  watchExternalChanges: true,
  restoreScrollPosition: true,
};

const CONTENT_WIDTHS: Record<ContentWidth, string> = {
  auto: "68ch",
  full: "100%",
  wide: "1400px",
  large: "1200px",
  medium: "992px",
  small: "768px",
  tiny: "576px",
};

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
  onThemeChange?: (theme: "light" | "dark" | "auto") => void;
  contentWidth?: ContentWidth;
  onContentWidthChange?: (width: ContentWidth) => void;
  dir?: "rtl" | "ltr" | "auto";
  /** زبانِ رابط. جهتِ رابط از آن گرفته می‌شود؛ متنِ سند در حالتِ auto بلوک‌به‌بلوک تشخیص داده می‌شود. */
  locale?: MarkdownLocale;
  onLocaleChange?: (locale: MarkdownLocale) => void;

  /** تعریفِ مارک‌های سفارشی. از دیتابیس می‌آید. */
  directives?: MarkRegistry;

  /** پنلِ ساختار. */
  outline?: boolean;

  /** عرضِ آغازینِ پنلِ ساختار برحسب پیکسل. */
  outlineWidth?: number;
  /** پس از تغییرِ عرض با ماوس یا کیبورد. */
  onOutlineWidthChange?: (width: number) => void;

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

  /** منوی درج عناصر سند مانند تصویر، جدول، فرمول و پانویس. */
  insertMenu?: boolean;

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
  /** پیش‌فرض: همه بسته و آکاردئونِ هم‌سطح. */
  folding?: FoldingOptions | false;

  /** سرعتِ مبنای تخمینِ مطالعه. پیش‌فرض ۲۵۰ کلمه در دقیقه. */
  readingWordsPerMinute?: number;

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
  onThemeChange,
  contentWidth = "auto",
  onContentWidthChange,
  dir = "auto",
  locale = "fa",
  onLocaleChange,
  directives = BUILTIN_MARKS,
  outline = false,
  outlineWidth = 240,
  onOutlineWidthChange,
  toolbar = false,
  paragraphMenu = true,
  formatMenu = true,
  viewMenu = true,
  fileMenu = true,
  editMenu = true,
  insertMenu = true,
  fileName = "document.md",
  onCloseDocument,
  stats = false,
  focusMode = false,
  typewriterMode = false,
  features,
  foldedIds,
  onFoldChange,
  folding,
  readingWordsPerMinute = 250,
  fullscreen = true,
  pdf = true,
  images,
  className,
}: MarkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const foldingInteractive = folding !== false;
  const [activeLocale, setActiveLocale] = useState<MarkdownLocale>(locale);
  const [activeTheme, setActiveTheme] = useState(theme);
  // ★ «خودکار» یعنی ساعتِ واقعیِ کاربر (۷ صبح تا ۱۹) نه تمِ سیستم‌عامل —
  //   این ادیتور برای کاربرِ غیرِبرنامه‌نویس است؛ prefers-color-scheme
  //   با «الان روز است» کاربر مطابقت نداشت (تمِ ویندوز/مرورگر می‌تواند
  //   هر چیزی باشد، ربطی به روز/شبِ واقعی ندارد).
  const [autoIsDay, setAutoIsDay] = useState(() => {
    const hour = new Date().getHours();
    return hour >= 7 && hour < 19;
  });
  useEffect(() => {
    if (activeTheme !== "auto") return;
    const tick = () => {
      const hour = new Date().getHours();
      setAutoIsDay(hour >= 7 && hour < 19);
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [activeTheme]);
  const resolvedTheme = activeTheme === "auto" ? (autoIsDay ? "light" : "dark") : activeTheme;
  const [activeContentWidth, setActiveContentWidth] = useState<ContentWidth>(contentWidth);
  const [activeFeatures, setActiveFeatures] = useState<Features>(() => ({ breaks: false, linkify: true, taskList: true, footnotes: true, toc: true, math: true, mermaid: false, highlight: true, emoji: false, html: "escape", ...features }));
  const [customThemeColors, setCustomThemeColors] = useState<CustomThemeColors>({ accent: "", background: "", foreground: "" });
  const [filePreferences, setFilePreferences] = useState<FilePreferences>(DEFAULT_FILE_PREFERENCES);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // ★ کاربر تاشدن را کلاً نمی‌خواهد — صرف‌نظر از `folding.initial`ِ
  //   ورودیِ مصرف‌کننده، همیشه باز شروع می‌شود. دکمهٔ فلش هم در
  //   index.css پنهان است تا کاربر نتواند دوباره ببندد.
  const [foldInitial, setFoldInitial] = useState<NonNullable<FoldingOptions["initial"]>>(
    "expanded",
  );
  // ★ کاربر آکاردئون را کلاً نمی‌خواهد — «multiple» یعنی بازکردنِ یک
  //   گره هم‌سطح‌هایش را نمی‌بندد. با mode="accordion" حتی وقتی
  //   folded خالی است، reconcileAccordion (که setFoldMode صدایش
  //   می‌زند) هم‌سطح‌های باز را به‌جز اولی می‌بست.
  const [foldMode, setFoldModeState] = useState<NonNullable<FoldingOptions["mode"]>>("multiple");
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set(foldedIds ?? []));
  const [mode, setMode] = useState<"live" | "source">("live");
  /** پیامِ کوتاه به کاربر — خطای آپلود یا شکستِ چاپ. */
  const [notice, setNotice] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchReplace, setSearchReplace] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [referenceLinkOpen, setReferenceLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [outlineVisible, setOutlineVisible] = useState(outline);
  const [activeOutlineWidth, setActiveOutlineWidth] = useState(() => Math.min(480, Math.max(176, outlineWidth)));
  const [outlineResizing, setOutlineResizing] = useState(false);
  const outlineResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [statusVisible, setStatusVisible] = useState(stats);
  const [wordCountOpen, setWordCountOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [sourceText, setSourceText] = useState("");
  const [sourceActiveIds, setSourceActiveIds] = useState<ReadonlySet<string>>(() => new Set());
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [documentFileName, setDocumentFileName] = useState(fileName);
  const fileHandleRef = useRef<MarkdownFileHandle | null>(null);
  const fileLastModifiedRef = useRef<number | null>(null);
  const savedMarkdownRef = useRef(value ?? defaultValue);
  const pendingSavedMarkdownRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [externalFileChanged, setExternalFileChanged] = useState(false);

  const updateDirty = useCallback((next: boolean) => {
    dirtyRef.current = next;
    setDirty(next);
  }, []);

  const markSaved = useCallback((markdown: string) => {
    savedMarkdownRef.current = markdown;
    updateDirty(false);
    setExternalFileChanged(false);
  }, [updateDirty]);

  const handleMarkdownChange = useCallback((markdown: string) => {
    console.log("[tm-dirty-debug]", markdown.length, savedMarkdownRef.current.length, pendingSavedMarkdownRef.current?.length ?? null, markdown === savedMarkdownRef.current, markdown === pendingSavedMarkdownRef.current);
    if (pendingSavedMarkdownRef.current !== null) {
      const isProgrammaticLoad = markdown === pendingSavedMarkdownRef.current;
      pendingSavedMarkdownRef.current = null;
      if (isProgrammaticLoad) {
        markSaved(markdown);
        onChange?.(markdown);
        return;
      }
    }
    updateDirty(markdown !== savedMarkdownRef.current);
    onChange?.(markdown);
  }, [markSaved, onChange, updateDirty]);

  useEffect(() => setOutlineVisible(outline), [outline]);
  useEffect(
    () => setActiveOutlineWidth(Math.min(480, Math.max(176, outlineWidth))),
    [outlineWidth],
  );
  useEffect(() => setStatusVisible(stats), [stats]);
  useEffect(() => setDocumentFileName(fileName), [fileName]);
  useEffect(() => setActiveLocale(locale), [locale]);
  useEffect(() => setActiveTheme(theme), [theme]);
  useEffect(() => setActiveContentWidth(contentWidth), [contentWidth]);
  useEffect(() => setActiveFeatures({ breaks: false, linkify: true, taskList: true, footnotes: true, toc: true, math: true, mermaid: false, highlight: true, emoji: false, html: "escape", ...features }), [features]);
  useEffect(() => {
    const storedTheme = window.localStorage.getItem("tm-markdown-theme");
    const storedWidth = window.localStorage.getItem("tm-markdown-content-width");
    const storedFeatures = window.localStorage.getItem("tm-markdown-features");
    const storedColors = window.localStorage.getItem("tm-markdown-custom-colors");
    const storedFilePreferences = window.localStorage.getItem("tm-markdown-file-preferences");
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "auto") setActiveTheme(storedTheme);
    if (storedWidth && storedWidth in CONTENT_WIDTHS) setActiveContentWidth(storedWidth as ContentWidth);
    if (storedFeatures) {
      try { setActiveFeatures((current) => ({ ...current, ...JSON.parse(storedFeatures) as Features })); } catch { /* تنظیم خراب نادیده گرفته می‌شود. */ }
    }
    if (storedColors) {
      try { setCustomThemeColors(JSON.parse(storedColors) as CustomThemeColors); } catch { /* تنظیم خراب نادیده گرفته می‌شود. */ }
    }
    if (storedFilePreferences) {
      try {
        setFilePreferences({
          ...DEFAULT_FILE_PREFERENCES,
          ...JSON.parse(storedFilePreferences) as Partial<FilePreferences>,
        });
      } catch { /* تنظیم خراب نادیده گرفته می‌شود. */ }
    }
  }, []);

  const changeTheme = useCallback((next: "light" | "dark" | "auto") => {
    setActiveTheme(next);
    window.localStorage.setItem("tm-markdown-theme", next);
    onThemeChange?.(next);
  }, [onThemeChange]);

  const changeContentWidth = useCallback((next: ContentWidth) => {
    setActiveContentWidth(next);
    window.localStorage.setItem("tm-markdown-content-width", next);
    onContentWidthChange?.(next);
  }, [onContentWidthChange]);

  const changeFeatures = useCallback((next: Features) => {
    setActiveFeatures(next);
    window.localStorage.setItem("tm-markdown-features", JSON.stringify(next));
  }, []);

  const changeCustomThemeColors = useCallback((next: CustomThemeColors) => {
    setCustomThemeColors(next);
    window.localStorage.setItem("tm-markdown-custom-colors", JSON.stringify(next));
  }, []);

  const changeFilePreferences = useCallback((next: FilePreferences) => {
    setFilePreferences(next);
    window.localStorage.setItem("tm-markdown-file-preferences", JSON.stringify(next));
  }, []);

  const exportSettings = useCallback(() => {
    const bundle = {
      version: 1,
      theme: activeTheme,
      contentWidth: activeContentWidth,
      locale: activeLocale,
      features: activeFeatures,
      customThemeColors,
      filePreferences,
    };
    downloadText(JSON.stringify(bundle, null, 2), "tamin-markdown-settings.json", "application/json;charset=utf-8");
  }, [activeContentWidth, activeFeatures, activeLocale, activeTheme, customThemeColors, filePreferences]);

  const importSettings = useCallback(async (file: File) => {
    try {
      const bundle = JSON.parse(await file.text()) as Record<string, unknown>;
      if (bundle.version !== 1) throw new Error("version");
      if (bundle.theme === "light" || bundle.theme === "dark" || bundle.theme === "auto") changeTheme(bundle.theme);
      if (typeof bundle.contentWidth === "string" && bundle.contentWidth in CONTENT_WIDTHS) changeContentWidth(bundle.contentWidth as ContentWidth);
      if (bundle.locale === "fa" || bundle.locale === "en") {
        setActiveLocale(bundle.locale);
        onLocaleChange?.(bundle.locale);
      }
      if (bundle.features && typeof bundle.features === "object") changeFeatures({ ...activeFeatures, ...bundle.features as Features });
      if (bundle.customThemeColors && typeof bundle.customThemeColors === "object") {
        const colors = bundle.customThemeColors as Partial<CustomThemeColors>;
        changeCustomThemeColors({ accent: String(colors.accent ?? ""), background: String(colors.background ?? ""), foreground: String(colors.foreground ?? "") });
      }
      if (bundle.filePreferences && typeof bundle.filePreferences === "object") {
        changeFilePreferences({ ...DEFAULT_FILE_PREFERENCES, ...bundle.filePreferences as Partial<FilePreferences> });
      }
      setNotice(translate(activeLocale, "تنظیمات وارد شد."));
    } catch {
      setNotice(translate(activeLocale, "فایل تنظیمات معتبر نیست."));
    }
  }, [activeFeatures, activeLocale, changeContentWidth, changeCustomThemeColors, changeFeatures, changeFilePreferences, changeTheme, onLocaleChange]);
  // ★ عمداً به `folding?.initial` گوش نمی‌دهد — همیشه باز.
  useEffect(() => setFoldInitial("expanded"), []);
  // ★ عمداً به `folding?.mode` گوش نمی‌دهد — آکاردئون کلاً خاموش است.
  useEffect(() => setFoldModeState("multiple"), []);

  const t = useCallback((text: string) => translate(activeLocale, text), [activeLocale]);
  const effectiveDir = dir === "auto" ? (activeLocale === "fa" ? "rtl" : "ltr") : dir;

  const clampZoom = useCallback((value: number) => setZoom(Math.min(200, Math.max(50, value))), []);
  const setOutlineWidth = useCallback(
    (width: number) => {
      const next = Math.round(Math.min(480, Math.max(176, width)));
      setActiveOutlineWidth(next);
      onOutlineWidthChange?.(next);
    },
    [onOutlineWidthChange],
  );

  const onOutlineResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    outlineResizeRef.current = { startX: event.clientX, startWidth: activeOutlineWidth };
    setOutlineResizing(true);
  }, [activeOutlineWidth]);

  const onOutlineResizeMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const start = outlineResizeRef.current;
    if (!start) return;
    const direction = effectiveDir === "rtl" ? -1 : 1;
    setOutlineWidth(start.startWidth + (event.clientX - start.startX) * direction);
  }, [effectiveDir, setOutlineWidth]);

  const onOutlineResizeEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!outlineResizeRef.current) return;
    outlineResizeRef.current = null;
    setOutlineResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onOutlineResizeKey = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === "Home") next = 176;
    else if (event.key === "End") next = 480;
    else if (event.key === "ArrowLeft") next = activeOutlineWidth + (effectiveDir === "rtl" ? 12 : -12);
    else if (event.key === "ArrowRight") next = activeOutlineWidth + (effectiveDir === "rtl" ? -12 : 12);
    if (next === null) return;
    event.preventDefault();
    setOutlineWidth(next);
  }, [activeOutlineWidth, effectiveDir, setOutlineWidth]);

  const toggleSource = useCallback(() => {
    setMode((current) => {
      // ★ موقعیتِ نسبیِ اسکرول (۰ تا ۱) بینِ دو حالت حفظ می‌شود — نه
      //   مکان‌نما، چون بلوکِ ۵ در حالتِ زنده لزوماً با خطِ متناظر در
      //   سورس یکی نیست؛ نسبت اما تقریبِ خوبی از «کجای سند» می‌دهد.
      if (current === "live") {
        const main = rootRef.current?.querySelector<HTMLElement>(".tm-main");
        const ratio = main && main.scrollHeight > main.clientHeight
          ? main.scrollTop / (main.scrollHeight - main.clientHeight)
          : 0;
        setSourceText(handleRef.current?.getMarkdown() ?? "");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const source = sourceRef.current;
            if (!source) return;
            source.scrollTop = ratio * (source.scrollHeight - source.clientHeight);
          });
        });
        return "source";
      }
      const source = sourceRef.current;
      const ratio = source && source.scrollHeight > source.clientHeight
        ? source.scrollTop / (source.scrollHeight - source.clientHeight)
        : 0;
      handleRef.current?.setMarkdown(source?.value ?? "");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const main = rootRef.current?.querySelector<HTMLElement>(".tm-main");
          if (!main) return;
          main.scrollTop = ratio * (main.scrollHeight - main.clientHeight);
        });
      });
      return "live";
    });
  }, []);

  const { ref, handle } = useEditor({
    value,
    defaultValue,
    onChange: handleMarkdownChange,
    debounceMs,
    readOnly,
    directives,
    locale: activeLocale,
    dir,
    folding: foldingInteractive ? { initial: foldInitial, mode: foldMode } : false,
    features: activeFeatures,
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

  const setDirectiveCardsOpen = useCallback((open: boolean) => {
    const root = rootRef.current;
    if (!root) return;
    for (const card of root.querySelectorAll<HTMLElement>(".tm-mark")) {
      card.dispatchEvent(new CustomEvent("tm-set-fold", { detail: { open } }));
    }
  }, []);

  const updateSourceActive = useCallback((source: HTMLTextAreaElement) => {
    const from = source.selectionStart;
    const to = source.selectionEnd;
    const value = source.value;
    const selection = value.slice(from, to);
    const lineStart = value.lastIndexOf("\n", Math.max(0, from - 1)) + 1;
    const line = value.slice(lineStart, value.indexOf("\n", from) === -1 ? value.length : value.indexOf("\n", from));
    const wrapped = (left: string, right = left) =>
      (value.slice(Math.max(0, from - left.length), from) === left && value.slice(to, to + right.length) === right) ||
      (selection.startsWith(left) && selection.endsWith(right));
    const next = new Set<string>();
    if (wrapped("**")) next.add("strong");
    if (wrapped("*")) next.add("emphasis");
    if (wrapped("~~")) next.add("strike");
    if (wrapped("`")) next.add("code");
    if (wrapped("<u>", "</u>")) next.add("underline");
    if (/^#{1,6}\s/.test(line)) next.add(`h${line.match(/^#+/)![0]!.length}`);
    if (/^- \[ \] /.test(line)) next.add("task");
    else if (/^- /.test(line)) next.add("ul");
    else if (/^\d+\. /.test(line)) next.add("ol");
    if (/^> /.test(line)) next.add("quote");
    setSourceActiveIds(next);
  }, []);

  useEffect(() => {
    if (mode !== "source") return;
    const sync = () => {
      if (sourceRef.current) updateSourceActive(sourceRef.current);
    };
    document.addEventListener("selectionchange", sync);
    sync();
    return () => document.removeEventListener("selectionchange", sync);
  }, [mode, updateSourceActive]);

  /**
   * منوهای بالای ادیتور در حالتِ Source باید خودِ Markdown را بسازند، نه
   * اینکه textarea را قفل کنند یا متن را از مسیرِ parser عبور دهند.
   */
  const applySourceAction = useCallback((id: string) => {
    const source = sourceRef.current;
    if (!source || readOnly) return;
    const from = source.selectionStart;
    const to = source.selectionEnd;
    const selected = source.value.slice(from, to) || "متن";
    const replace = (next: string) => {
      source.setRangeText(next, from, to, "select");
      setSourceText(source.value);
      updateSourceActive(source);
    };
    const wrap = (left: string, right = left) => {
      const before = source.value.slice(Math.max(0, from - left.length), from);
      const after = source.value.slice(to, to + right.length);
      if (before === left && after === right) {
        source.setRangeText(selected, from - left.length, to + right.length, "select");
        setSourceText(source.value);
        updateSourceActive(source);
      } else if (selected.startsWith(left) && selected.endsWith(right)) {
        replace(selected.slice(left.length, selected.length - right.length));
      } else replace(`${left}${selected}${right}`);
    };
    const lineRange = () => {
      const start = source.value.lastIndexOf("\n", Math.max(0, from - 1)) + 1;
      const endAt = source.value.indexOf("\n", to);
      return { start, end: endAt === -1 ? source.value.length : endAt };
    };
    const prefixLines = (prefix: string) => {
      const { start, end } = lineRange();
      const lines = source.value.slice(start, end).split("\n");
      source.setSelectionRange(start, end);
      source.setRangeText(
        lines.map((line, index) => prefix === "1. " ? `${index + 1}. ${line}` : `${prefix}${line}`).join("\n"),
        start,
        end,
        "select",
      );
      setSourceText(source.value);
      updateSourceActive(source);
    };
    const heading = (level: number) => {
      const { start, end } = lineRange();
      const lines = source.value.slice(start, end).split("\n");
      source.setSelectionRange(start, end);
      source.setRangeText(lines.map((line) => `${"#".repeat(level)} ${line.replace(/^#{1,6}\s+/, "")}`).join("\n"), start, end, "select");
      setSourceText(source.value);
      updateSourceActive(source);
    };

    switch (id) {
      case "bold": case "strong": wrap("**"); break;
      case "italic": case "emphasis": wrap("*"); break;
      case "strike": wrap("~~"); break;
      case "code": wrap("`"); break;
      case "underline": wrap("<u>", "</u>"); break;
      case "comment": wrap("%%"); break;
      case "link": case "hyperlink": replace(`[${selected}](https://)`); break;
      case "image-url": case "image-local": replace(`![${selected}](https://)`); break;
      case "h1": case "heading-1": heading(1); break;
      case "h2": case "heading-2": heading(2); break;
      case "h3": case "heading-3": heading(3); break;
      case "heading-4": heading(4); break;
      case "heading-5": heading(5); break;
      case "heading-6": heading(6); break;
      case "paragraph": {
        const { start, end } = lineRange();
        const lines = source.value.slice(start, end).split("\n");
        source.setRangeText(lines.map((line) => line.replace(/^#{1,6}\s+/, "")).join("\n"), start, end, "select");
        setSourceText(source.value);
        updateSourceActive(source);
        break;
      }
      case "ul": case "bullet": prefixLines("- "); break;
      case "ol": case "ordered": prefixLines("1. "); break;
      case "task": prefixLines("- [ ] "); break;
      case "quote": prefixLines("> "); break;
      case "codeblock": case "code-block": replace(`\`\`\`\n${selected}\n\`\`\``); break;
      case "math": replace(`$$\n${selected}\n$$`); break;
      case "table": case "table-insert": replace("| ستون ۱ | ستون ۲ |\n| --- | --- |\n| متن | متن |"); break;
      case "hr": replace("\n---\n"); break;
      case "zwnj": replace("‌"); break;
      case "footnote": replace(`[^1]`); break;
      case "toc": replace("[TOC]"); break;
      case "yaml": replace("---\ntitle: \n---\n"); break;
      case "alert-note": replace(`> [!NOTE]\n> ${selected}`); break;
      case "alert-tip": replace(`> [!TIP]\n> ${selected}`); break;
      case "alert-important": replace(`> [!IMPORTANT]\n> ${selected}`); break;
      case "alert-warning": replace(`> [!WARNING]\n> ${selected}`); break;
      case "alert-caution": replace(`> [!CAUTION]\n> ${selected}`); break;
      case "indent": prefixLines("  "); break;
      case "outdent": {
        const { start, end } = lineRange();
        const lines = source.value.slice(start, end).split("\n");
        source.setRangeText(lines.map((line) => line.replace(/^ {1,2}/, "")).join("\n"), start, end, "select");
        setSourceText(source.value);
        updateSourceActive(source);
        break;
      }
      default: break;
    }
    const markdown = source.value;
    setSourceText(markdown);
    updateDirty(markdown !== savedMarkdownRef.current);
    onChange?.(markdown);
  }, [onChange, readOnly, updateDirty, updateSourceActive]);

  const applySourceEditAction = useCallback((id: string) => {
    const source = sourceRef.current;
    if (!source || readOnly) return;
    const from = source.selectionStart;
    const to = source.selectionEnd;
    const selected = source.value.slice(from, to);
    const sync = () => {
      const markdown = source.value;
      setSourceText(markdown);
      updateDirty(markdown !== savedMarkdownRef.current);
      onChange?.(markdown);
      updateSourceActive(source);
    };
    const copy = async (text: string) => {
      if (!text) return;
      try { await navigator.clipboard.writeText(text); }
      catch { setNotice(t("دسترسی به کلیپ‌بورد ممکن نشد.")); }
    };

    switch (id) {
      case "undo": document.execCommand("undo"); sync(); break;
      case "redo": document.execCommand("redo"); sync(); break;
      case "cut": void copy(selected).then(() => { source.setRangeText("", from, to, "start"); sync(); }); break;
      case "copy": case "copy-markdown": case "copy-plain": case "copy-html": void copy(selected); break;
      case "paste-plain":
        void navigator.clipboard.readText().then((text) => { source.setRangeText(text, from, to, "end"); sync(); })
          .catch(() => setNotice(t("خواندنِ کلیپ‌بورد ممکن نشد.")));
        break;
      case "select-all": source.select(); updateSourceActive(source); break;
      case "duplicate": source.setRangeText(selected || source.value.slice(source.value.lastIndexOf("\n", Math.max(0, from - 1)) + 1, source.value.indexOf("\n", to) === -1 ? source.value.length : source.value.indexOf("\n", to)), to, to, "end"); sync(); break;
      case "delete": source.setRangeText("", from, to, "start"); sync(); break;
      case "find": setSearchReplace(false); setSearchOpen(true); break;
      case "replace": setSearchReplace(true); setSearchOpen(true); break;
      default: break;
    }
  }, [onChange, readOnly, t, updateDirty, updateSourceActive]);

  const setAllSectionsOpen = useCallback(
    (open: boolean) => {
      if (!foldingInteractive) return;
      const view = handleRef.current.view;
      if (!view) return;
      (open ? unfoldAll() : foldAll())(view.state, view.dispatch);
      (open ? unfoldAllListNodes : foldAllListNodes)(view.state, view.dispatch);
      setDirectiveCardsOpen(open);
      setFolded(new Set(foldKey.getState(view.state)?.folded ?? []));
    },
    [foldingInteractive, setDirectiveCardsOpen],
  );

  useEffect(() => {
    const view = handle.view;
    if (!view || !foldingInteractive) return;
    setFoldMode(foldMode)(view.state, view.dispatch);
    setListFoldMode(foldMode)(view.state, view.dispatch);
  }, [handle.view, foldMode, foldingInteractive]);

  useEffect(() => {
    const view = handle.view;
    if (!view) return;
    setFolded(new Set(foldKey.getState(view.state)?.folded ?? []));
  }, [handle.view, handle.outline]);

  /*
   * foldPlugin تنها منبعِ حقیقتِ گره‌های ساختاری است. هر تراکنشِ آن
   * (از متن، Outline، آکاردئون یا فرمانِ همه) باید همهٔ NodeViewها را
   * دوباره با state نهایی همگام کند؛ همگام‌سازیِ فقط گرهٔ کلیک‌شده باعث
   * می‌شد خواهرِ بسته‌شده به‌وسیلهٔ آکاردئون، ظاهراً باز بماند.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    for (const card of root.querySelectorAll<HTMLElement>(".tm-mark[data-fold-id]")) {
      const id = card.dataset.foldId;
      if (!id) continue;
      card.dispatchEvent(new CustomEvent("tm-set-fold", { detail: { open: !folded.has(id) } }));
    }
  }, [folded]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onCardFoldChange = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; pos?: number; open?: boolean }>).detail;
      if (!detail || typeof detail.id !== "string" || typeof detail.pos !== "number") return;
      if (typeof detail.open !== "boolean") return;
      const view = handleRef.current.view;
      if (!view) return;
      const isFolded = foldKey.getState(view.state)?.folded.has(detail.id) ?? false;
      if (detail.open !== isFolded) return;
      toggleFoldPreservingScroll(view, detail.id, detail.pos);
      setFolded(new Set(foldKey.getState(view.state)?.folded ?? []));
    };
    root.addEventListener("tm-card-fold-change", onCardFoldChange);
    return () => root.removeEventListener("tm-card-fold-change", onCardFoldChange);
  }, []);

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
    requestAnimationFrame(() => setAllSectionsOpen(foldInitial === "expanded"));
  }, [foldInitial, setAllSectionsOpen]);

  const replaceSavedDocument = useCallback((markdown: string) => {
    const canonical = serialize(parse(markdown, { linkify: activeFeatures.linkify !== false }));
    pendingSavedMarkdownRef.current = canonical;
    replaceDocument(markdown);
    // بعضی ورودی‌های رسمی هنگام ورود یک‌بار به شکل متعارف serializer
    // درمی‌آیند. baseline باید همان سندِ واقعاً داخل ادیتور باشد؛ وگرنه
    // فایلِ تازه‌بازشده بی هیچ ویرایشی فوراً «تغییرکرده» نشان داده می‌شود.
    markSaved(canonical);
  }, [activeFeatures.linkify, markSaved, replaceDocument]);

  const confirmDiscard = useCallback(() => {
    if (!dirtyRef.current) return true;
    if (!filePreferences.confirmBeforeDiscard) return true;
    return window.confirm(t("تغییرات ذخیره‌نشده از بین می‌رود. ادامه می‌دهید؟"));
  }, [filePreferences.confirmBeforeDiscard, t]);

  const writeMarkdown = useCallback(async (handle: MarkdownFileHandle, markdown: string) => {
    const writable = await handle.createWritable();
    await writable.write(markdown);
    await writable.close();
    const file = await handle.getFile();
    fileLastModifiedRef.current = file.lastModified;
    fileHandleRef.current = handle;
    setDocumentFileName(file.name);
    markSaved(markdown);
    setNotice(t("ذخیره انجام شد."));
  }, [markSaved, t]);

  const saveMarkdownAs = useCallback(async () => {
    const markdown = currentMarkdown();
    const picker = (window as FilePickerWindow).showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({
          suggestedName: documentFileName,
          types: [{ description: "Markdown", accept: { "text/markdown": [".md", ".markdown"] } }],
        });
        await writeMarkdown(handle, markdown);
        return;
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return;
        setNotice(activeLocale === "en" ? "Could not save the file." : "ذخیره فایل ممکن نشد.");
        return;
      }
    }
    downloadText(markdown, documentFileName, "text/markdown;charset=utf-8");
    markSaved(markdown);
  }, [activeLocale, currentMarkdown, documentFileName, markSaved, writeMarkdown]);

  const saveMarkdown = useCallback(async () => {
    const handle = fileHandleRef.current;
    if (!handle) {
      await saveMarkdownAs();
      return;
    }
    try {
      await writeMarkdown(handle, currentMarkdown());
    } catch {
      setNotice(activeLocale === "en" ? "Could not save the file." : "ذخیره فایل ممکن نشد.");
    }
  }, [activeLocale, currentMarkdown, saveMarkdownAs, writeMarkdown]);

  const newDocument = useCallback(() => {
    if (!confirmDiscard()) return;
    fileHandleRef.current = null;
    fileLastModifiedRef.current = null;
    setDocumentFileName(fileName);
    replaceSavedDocument("");
  }, [confirmDiscard, fileName, replaceSavedDocument]);

  const openDocument = useCallback(async () => {
    if (!confirmDiscard()) return;
    const picker = (window as FilePickerWindow).showOpenFilePicker;
    if (!picker) {
      documentInputRef.current?.click();
      return;
    }
    try {
      const [handle] = await picker({
        multiple: false,
        types: [{ description: "Markdown", accept: { "text/markdown": [".md", ".markdown", ".txt"] } }],
      });
      if (!handle) return;
      const file = await handle.getFile();
      const markdown = await file.text();
      fileHandleRef.current = handle;
      fileLastModifiedRef.current = file.lastModified;
      setDocumentFileName(file.name);
      replaceSavedDocument(markdown);
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return;
      setNotice(activeLocale === "en" ? "Could not read the file." : "خواندنِ فایل ممکن نشد.");
    }
  }, [activeLocale, confirmDiscard, replaceSavedDocument]);

  const openDocumentFromUrl = useCallback(async (rawUrl: string) => {
    if (!confirmDiscard()) return false;
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
      const response = await fetch(url, { headers: { Accept: "text/markdown, text/plain;q=0.9" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
      const pathName = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
      const extensionIsMarkdown = /\.(?:md|markdown|txt)$/i.test(pathName);
      const typeIsText = contentType === "text/markdown" || contentType === "text/plain" || contentType === "text/x-markdown";
      if (!typeIsText && !extensionIsMarkdown) throw new Error("content-type");
      const length = Number(response.headers.get("content-length") ?? "0");
      if (Number.isFinite(length) && length > 5_000_000) throw new Error("size");
      const markdown = await response.text();
      if (markdown.length > 5_000_000) throw new Error("size");
      fileHandleRef.current = null;
      fileLastModifiedRef.current = null;
      setDocumentFileName(pathName || "remote.md");
      replaceSavedDocument(markdown);
      setUrlOpen(false);
      return true;
    } catch {
      setNotice(t("بازکردن نشانی ممکن نشد؛ نشانی، CORS و نوع فایل را بررسی کنید."));
      return false;
    }
  }, [confirmDiscard, replaceSavedDocument, t]);

  const reloadExternalFile = useCallback(async () => {
    const handle = fileHandleRef.current;
    if (!handle) return;
    if (dirtyRef.current && !confirmDiscard()) return;
    try {
      const file = await handle.getFile();
      const markdown = await file.text();
      fileLastModifiedRef.current = file.lastModified;
      replaceSavedDocument(markdown);
      setNotice(null);
    } catch {
      setNotice(activeLocale === "en" ? "Could not reload the file." : "بارگذاری دوباره فایل ممکن نشد.");
    }
  }, [activeLocale, confirmDiscard, replaceSavedDocument]);

  const saveHtml = useCallback(() => {
    const html = exportHtml(parse(currentMarkdown()), {
      directives,
      dir: effectiveDir,
      standalone: true,
    });
    downloadText(html, replaceExtension(documentFileName, ".html"), "text/html;charset=utf-8");
  }, [currentMarkdown, directives, effectiveDir, documentFileName]);

  const onNavigate = useCallback((node: OutlineNode) => {
    setActiveOutlineId(node.id);
    // ★ حالتِ Source از ProseMirror جدا است — سندِ زنده در آن اصلاً
    //   نصب نیست، پس با موقعیتِ node.from در آن سروکار نداریم؛ خطِ
    //   عنوان را در متنِ خام پیدا و به‌جایش اسکرول می‌کنیم.
    if (mode === "source") {
      const source = sourceRef.current;
      if (!source) return;
      const lines = source.value.split("\n");
      const lineIndex = lines.findIndex((line) => line.includes(node.title));
      if (lineIndex === -1) return;
      const lineStart = lines.slice(0, lineIndex).reduce((sum, line) => sum + line.length + 1, 0);
      source.focus();
      source.setSelectionRange(lineStart, lineStart + lines[lineIndex]!.length);
      updateSourceActive(source);
      const lineHeight = parseFloat(getComputedStyle(source).lineHeight) || 24;
      source.scrollTop = Math.max(0, lineIndex * lineHeight - source.clientHeight / 2);
      return;
    }
    const view = handleRef.current.view;
    if (!view) return;
    if (foldKey.getState(view.state)?.folded.has(node.id)) {
      toggleFoldPreservingScroll(view, node.id, node.from);
      setFolded(new Set(foldKey.getState(view.state)?.folded ?? []));
    }
    const { state } = view;
    // `Selection.near` نزدیک‌ترین جای معتبر را پیدا می‌کند — گرهِ ساختار
    // ممکن است atom باشد و مکان‌نما مستقیم داخلش ننشیند.
    const pos = Math.min(node.from + 1, state.doc.content.size);
    const selection = Selection.near(state.doc.resolve(pos));
    view.dispatch(state.tr.setSelection(selection));
    view.focus();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target = view.nodeDOM(node.from);
        const element = target instanceof HTMLElement ? target : target?.parentElement;
        if (!element) return;
        // ناوبریِ پنل باید مقصد را همان لحظه زیرِ نوار ابزار قرار دهد.
        // پیمایشِ smooth در سندهای بلند از ده‌ها بخش عبور می‌کرد؛ scroll-spy
        // همان بخش‌های میانی را فعال می‌کرد و انتخابِ پنل را می‌دزدید.
        element.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
        element.classList.add("tm-nav-highlight");
        window.setTimeout(() => element.classList.remove("tm-nav-highlight"), 1600);
      });
    });
  }, [mode, updateSourceActive]);

  /**
   * حالتِ تاشدگی داخلِ ProseMirror زندگی می‌کند، نه در React. پس React
   * از تغییرش خبردار نمی‌شود و پنلِ کناری با `aria-expanded`ِ کهنه
   * می‌ماند. این نسخهٔ آینه‌ایِ آن است تا رندرِ دوباره اتفاق بیفتد.
   */
  const fs = useFullscreen(() => rootRef.current);

  const runExportPdf = useCallback(() => {
    const opts = typeof pdf === "object" ? pdf : {};
    void exportPdf(parse(currentMarkdown()), {
      directives,
      dir: effectiveDir,
      ...opts,
    }).then((r) => {
      if (!r.ok) setNotice(r.reason ?? (activeLocale === "en" ? "PDF export failed." : "خروجیِ PDF شکست خورد."));
    });
  }, [pdf, directives, effectiveDir, currentMarkdown, activeLocale]);

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
            .catch(() => setNotice(activeLocale === "en" ? "Clipboard access failed." : "دسترسی به کلیپ‌بورد ممکن نشد."));
        }
        return;
      }
      if (fileMenu && (e.ctrlKey || e.metaKey)) {
        const key = e.key.toLowerCase();
        if (key === "n") {
          e.preventDefault();
          newDocument();
        } else if (key === "o") {
          e.preventDefault();
          void openDocument();
        } else if (key === "s") {
          e.preventDefault();
          if (e.shiftKey) void saveMarkdownAs();
          else void saveMarkdown();
        }
      }
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [fullscreen, pdf, fs, runExportPdf, fileMenu, editMenu, mode, newDocument, openDocument, saveMarkdown, saveMarkdownAs, activeLocale]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!filePreferences.confirmBeforeDiscard || !dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [filePreferences.confirmBeforeDiscard]);

  useEffect(() => {
    if (!filePreferences.watchExternalChanges) return;
    const timer = window.setInterval(() => {
      const handle = fileHandleRef.current;
      const known = fileLastModifiedRef.current;
      if (!handle || known == null) return;
      void handle.getFile().then((file) => {
        if (file.lastModified !== known) setExternalFileChanged(true);
      }).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [filePreferences.watchExternalChanges]);

  /** پیام پس از چند ثانیه خودش می‌رود — کاربر نباید ببنددش. */
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // ★ پنلِ کناری دیگر با متنِ اصلی هم‌سرنوشت نیست — تاشدنِ خودش را
  //   جداگانه نگه می‌دارد و دیگر foldKeyِ سند را دست نمی‌زند. قبلاً
  //   toggleFoldPreservingScroll همان state سند را عوض می‌کرد، پس
  //   بستنِ یک آیتم در پنل، همان بخش را در متنِ اصلی هم جمع می‌کرد.
  const [sidebarFolded, setSidebarFolded] = useState<ReadonlySet<string>>(() => new Set());
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const sidebarTouchedRef = useRef(false);

  useEffect(() => {
    const main = rootRef.current?.querySelector<HTMLElement>(".tm-main");
    if (!main) return;
    const key = `tm-markdown-scroll:${documentFileName}`;
    if (filePreferences.restoreScrollPosition) {
      const stored = Number.parseFloat(window.localStorage.getItem(key) ?? "");
      if (Number.isFinite(stored)) requestAnimationFrame(() => { main.scrollTop = stored; });
    }
    const remember = () => window.localStorage.setItem(key, String(main.scrollTop));
    if (!filePreferences.restoreScrollPosition) return;
    main.addEventListener("scroll", remember, { passive: true });
    return () => {
      remember();
      main.removeEventListener("scroll", remember);
    };
  }, [documentFileName, filePreferences.restoreScrollPosition]);

  useEffect(() => {
    const items = flattenOutline(handle.outline);
    const foldableIds = items.filter((item) => item.foldable).map((item) => item.id);
    if (!foldableIds.length) return;

    const storageKey = `tm-markdown-outline:${documentFileName}`;
    if (!sidebarTouchedRef.current) {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        try {
          const saved = JSON.parse(stored) as string[];
          const valid = new Set(items.map((item) => item.id));
          setSidebarFolded(new Set(saved.filter((id) => valid.has(id))));
          sidebarTouchedRef.current = true;
          return;
        } catch { /* مقدار خراب با پیش‌فرض جایگزین می‌شود. */ }
      }
      const next = new Set(foldableIds);
      if (handle.outline.length === 1) next.delete(handle.outline[0]!.id);
      setSidebarFolded(next);
      return;
    }

    const valid = new Set(items.map((item) => item.id));
    setSidebarFolded((previous) => new Set([...previous].filter((id) => valid.has(id))));
  }, [documentFileName, handle.outline]);

  useEffect(() => {
    if (!sidebarTouchedRef.current) return;
    window.localStorage.setItem(`tm-markdown-outline:${documentFileName}`, JSON.stringify([...sidebarFolded]));
  }, [documentFileName, sidebarFolded]);

  useEffect(() => {
    const view = handle.view;
    const root = rootRef.current;
    const main = root?.querySelector<HTMLElement>(".tm-main");
    const items = flattenOutline(handle.outline);
    if (!view || !main || !items.length) return;

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const controlsBottom = main
          .querySelector<HTMLElement>(".tm-editor-controls")
          ?.getBoundingClientRect().bottom;
        const threshold = controlsBottom != null
          ? controlsBottom + 24
          : main.getBoundingClientRect().top + 24;
        // scrollIntoView و ارتفاعِ فونت/toolbar ممکن است عنوانِ مقصد را
        // چند پیکسل پایین‌تر از threshold بنشانند. بدون این ناحیهٔ تحمل،
        // scroll-spy بلافاصله «آخرین زیرعنوان فصل قبل» را فعال می‌کرد؛
        // همان پرش بدی که بعد از کلیک روی فصل ششم دیده می‌شد.
        const activationLine = threshold + 64;
        let active = items[0]!;
        for (const item of items) {
          const dom = view.nodeDOM(item.from);
          const element = dom instanceof HTMLElement ? dom : dom?.parentElement;
          if (!element) continue;
          if (element.getBoundingClientRect().top <= activationLine) active = item;
          else break;
        }
        setActiveOutlineId((current) => (current === active.id ? current : active.id));
      });
    };

    update();
    main.addEventListener("scroll", update, { passive: true });
    view.dom.addEventListener("keyup", update);
    view.dom.addEventListener("click", update);
    return () => {
      cancelAnimationFrame(frame);
      main.removeEventListener("scroll", update);
      view.dom.removeEventListener("keyup", update);
      view.dom.removeEventListener("click", update);
    };
  }, [handle.view, handle.outline]);

  useEffect(() => {
    if (!activeOutlineId) return;
    const path = findOutlinePath(handle.outline, activeOutlineId);
    if (!path || path.length < 2) return;
    setSidebarFolded((previous) => {
      const next = new Set(previous);
      const root = path[0]!;
      const activeChapter = path[1]!;
      if (handle.outline.length === 1) {
        next.delete(root.id);
        for (const sibling of root.children) {
          if (sibling.foldable && sibling.id !== activeChapter.id) next.add(sibling.id);
        }
      }
      for (const ancestor of path.slice(0, -1)) next.delete(ancestor.id);
      return next;
    });
  }, [activeOutlineId, handle.outline]);

  const onToggleFoldNode = useCallback((node: OutlineNode) => {
    sidebarTouchedRef.current = true;
    setSidebarFolded((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) {
        const root = handle.outline.length === 1 ? handle.outline[0] : undefined;
        if (root?.children.some((child) => child.id === node.id)) {
          for (const sibling of root.children) {
            if (sibling.foldable) next.add(sibling.id);
          }
        }
        next.delete(node.id);
      } else {
        next.add(node.id);
      }
      return next;
    });
  }, [handle.outline]);

  const collapseSidebar = useCallback(() => {
    sidebarTouchedRef.current = true;
    const next = new Set(
      flattenOutline(handle.outline)
        .filter((node) => node.foldable)
        .map((node) => node.id),
    );
    if (handle.outline.length === 1) next.delete(handle.outline[0]!.id);
    setSidebarFolded(next);
  }, [handle.outline]);

  return (
    <MarkdownI18nProvider locale={activeLocale}>
    <div
      ref={rootRef}
      className={`tm-root ${className ?? ""}`}
      data-theme={resolvedTheme}
      data-mode={mode}
      data-fullscreen={fs.active ? (fs.soft ? "soft" : "real") : undefined}
      dir={effectiveDir}
      lang={activeLocale}
      data-locale={activeLocale}
      data-outline-resizing={outlineResizing ? "true" : undefined}
      data-breaks={activeFeatures.breaks === true ? "true" : "false"}
      data-footnotes={activeFeatures.footnotes === false ? "false" : "true"}
      style={{
        "--tm-content-zoom": zoom / 100,
        "--tm-measure": CONTENT_WIDTHS[activeContentWidth],
        ...(customThemeColors.accent ? { "--tm-accent": customThemeColors.accent } : {}),
        ...(customThemeColors.background ? { "--tm-bg": customThemeColors.background } : {}),
        ...(customThemeColors.foreground ? { "--tm-fg": customThemeColors.foreground } : {}),
      } as CSSProperties}
    >
      {outlineVisible ? (
        <aside
          className="tm-sidebar"
          aria-label={t("پنلِ ساختار")}
          style={{ "--tm-sidebar-width": `${activeOutlineWidth}px` } as CSSProperties}
        >
          <OutlineTree
            nodes={handle.outline}
            activeId={activeOutlineId}
            folded={sidebarFolded}
            onNavigate={onNavigate}
            onToggleFold={onToggleFoldNode}
            onCollapseAll={collapseSidebar}
            onClose={() => setOutlineVisible(false)}
          />
        </aside>
      ) : null}

      {outlineVisible ? (
        <div
          className="tm-sidebar-resizer"
          role="separator"
          aria-label={t("تغییر عرض پنل ساختار")}
          aria-orientation="vertical"
          aria-valuemin={176}
          aria-valuemax={480}
          aria-valuenow={activeOutlineWidth}
          tabIndex={0}
          onPointerDown={onOutlineResizeStart}
          onPointerMove={onOutlineResizeMove}
          onPointerUp={onOutlineResizeEnd}
          onPointerCancel={onOutlineResizeEnd}
          onLostPointerCapture={onOutlineResizeEnd}
          onKeyDown={onOutlineResizeKey}
        />
      ) : null}

      {outline && !outlineVisible ? (
        <button
          type="button"
          className="tm-outline-toggle tm-outline-toggle-rail"
          aria-label={t("بازکردن پنل ساختار")}
          aria-expanded="false"
          onClick={() => setOutlineVisible(true)}
        >
          <Menu size={18} aria-hidden />
        </button>
      ) : null}

      <div className="tm-main">
        {!toolbar ? (
          <SearchPanel
            view={handle.view}
            open={searchOpen}
            withReplace={searchReplace}
            onClose={() => setSearchOpen(false)}
          />
        ) : null}

        {toolbar ? (
          <div className="tm-editor-controls">
            <SearchPanel
              view={handle.view}
              open={searchOpen}
              withReplace={searchReplace}
              onClose={() => setSearchOpen(false)}
            />
            {fileMenu || editMenu || insertMenu || paragraphMenu || formatMenu || viewMenu ? (
              <div className="tm-top-menu-row">
                {fileMenu ? (
                  <FileMenu
                    onNew={newDocument}
                    onOpen={() => void openDocument()}
                    onOpenUrl={() => setUrlOpen(true)}
                    onSave={() => void saveMarkdown()}
                    onSaveAs={() => void saveMarkdownAs()}
                    onExportHtml={saveHtml}
                    onExportPdf={pdf !== false ? runExportPdf : undefined}
                    onClose={onCloseDocument ? () => { if (confirmDiscard()) onCloseDocument(); } : undefined}
                    dirty={dirty}
                  />
                ) : null}
                {editMenu ? (
                  <EditMenu
                    view={mode === "live" ? handle.view : null}
                    onSourceAction={mode === "source" && !readOnly ? applySourceEditAction : undefined}
                    onFind={() => {
                      setSearchReplace(false);
                      setSearchOpen(true);
                    }}
                    onReplace={() => {
                      setSearchReplace(true);
                      setSearchOpen(true);
                    }}
                    onNotice={(message) => setNotice(t(message))}
                  />
                ) : null}
                {insertMenu ? (
                  <InsertMenu
                    view={mode === "live" ? handle.view : null}
                    onSourceAction={mode === "source" && !readOnly ? applySourceAction : undefined}
                    onInsertLink={() => setLinkOpen(true)}
                    onInsertReferenceLink={() => setReferenceLinkOpen(true)}
                    onInsertImage={() => setImageOpen(true)}
                    onInsertLocalImage={() => imageInputRef.current?.click()}
                  />
                ) : null}
                {paragraphMenu ? (
                  <ParagraphMenu
                    view={mode === "live" ? handle.view : null}
                    onSourceAction={mode === "source" && !readOnly ? applySourceAction : undefined}
                    sourceActiveIds={mode === "source" ? sourceActiveIds : undefined}
                    onInsertReferenceLink={() => setReferenceLinkOpen(true)}
                    onNotice={(message) => setNotice(t(message))}
                  />
                ) : null}
                {formatMenu ? (
                  <FormatMenu
                    view={mode === "live" ? handle.view : null}
                    onSourceAction={mode === "source" && !readOnly ? applySourceAction : undefined}
                    sourceActiveIds={mode === "source" ? sourceActiveIds : undefined}
                    onEditLink={() => setLinkOpen(true)}
                    onInsertImage={() => setImageOpen(true)}
                    onInsertLocalImage={() => imageInputRef.current?.click()}
                    onNotice={(message) => setNotice(t(message))}
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
                    onOpenSettings={() => setSettingsOpen(true)}
                    locale={activeLocale}
                    onLocaleChange={(next) => {
                      setActiveLocale(next);
                      onLocaleChange?.(next);
                    }}
                    foldInitial={foldInitial}
                    onFoldInitialChange={foldingInteractive ? (next) => {
                        setFoldInitial(next);
                        setAllSectionsOpen(next === "expanded");
                      } : undefined}
                    foldMode={foldMode}
                    onFoldModeChange={foldingInteractive ? setFoldModeState : undefined}
                    onFoldAll={foldingInteractive ? () => setAllSectionsOpen(false) : undefined}
                    onUnfoldAll={foldingInteractive ? () => setAllSectionsOpen(true) : undefined}
                  />
                ) : null}
              </div>
            ) : null}
            <Toolbar
              view={handle.view}
              compact={toolbar === "compact"}
              onToggleSource={toggleSource}
              sourceMode={mode === "source"}
              onSourceAction={mode === "source" && !readOnly ? applySourceAction : undefined}
              sourceActiveIds={mode === "source" ? sourceActiveIds : undefined}
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
        {urlOpen ? <UrlOpenPopover onOpen={openDocumentFromUrl} onClose={() => setUrlOpen(false)} /> : null}
        {settingsOpen ? (
          <AppearanceSettings
            theme={activeTheme}
            contentWidth={activeContentWidth}
            features={activeFeatures}
            customThemeColors={customThemeColors}
            filePreferences={filePreferences}
            onThemeChange={changeTheme}
            onContentWidthChange={changeContentWidth}
            onFeaturesChange={changeFeatures}
            onCustomThemeColorsChange={changeCustomThemeColors}
            onFilePreferencesChange={changeFilePreferences}
            onExportSettings={exportSettings}
            onImportSettings={importSettings}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}
        <input
          ref={documentInputRef}
          type="file"
          suppressHydrationWarning
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
                fileHandleRef.current = null;
                fileLastModifiedRef.current = file.lastModified;
                setDocumentFileName(file.name);
                replaceSavedDocument(markdown);
              })
              .catch(() => setNotice(activeLocale === "en" ? "Could not read the file." : "خواندنِ فایل ممکن نشد."));
          }}
        />
        <input
          ref={imageInputRef}
          type="file"
          suppressHydrationWarning
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
                setNotice(t(message));
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
            suppressHydrationWarning
            defaultValue={sourceText}
            readOnly={readOnly}
            dir={effectiveDir}
            spellCheck={false}
            onInput={(event) => {
              const markdown = event.currentTarget.value;
              setSourceText(markdown);
              updateDirty(markdown !== savedMarkdownRef.current);
              onChange?.(markdown);
              updateSourceActive(event.currentTarget);
            }}
            onSelect={(event) => updateSourceActive(event.currentTarget)}
            onKeyUp={(event) => updateSourceActive(event.currentTarget)}
            aria-label={t("متنِ خامِ مارک‌داون")}
          />
        ) : null}

        {/* ظرفِ نسبی تا منو کنارِ مکان‌نما بنشیند */}
        <div className="tm-editor-wrap" hidden={mode === "source"}>
          <SlashMenu view={handle.view} />
          <div
          ref={ref}
          className="tm-editor-mount"
          data-placeholder={placeholder}
          />
        </div>

        {wordCountOpen ? (
          <StatsPopover
            view={handle.view}
            wordsPerMinute={readingWordsPerMinute}
            onClose={() => setWordCountOpen(false)}
          />
        ) : null}
        {statusVisible ? <StatsBar view={handle.view} wordsPerMinute={readingWordsPerMinute} /> : null}

        {/* ★ `role="status"` تا صفحه‌خوان هم بشنود — بندِ ۱۲. */}
        {notice || externalFileChanged ? (
          <div className="tm-notice" role="status" aria-live="polite">
            <span>{notice ?? t("فایل بیرون از برنامه تغییر کرده است.")}</span>
            {externalFileChanged ? (
              <button type="button" onClick={() => void reloadExternalFile()}>
                {t("بارگذاری دوباره")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
    </MarkdownI18nProvider>
  );
}

function UrlOpenPopover({
  onOpen,
  onClose,
}: {
  onOpen: (url: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const { t } = useMarkdownI18n();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="tm-url-open-popover"
      role="dialog"
      aria-label={t("بازکردن Markdown از نشانی")}
      onSubmit={(event) => {
        event.preventDefault();
        if (!url.trim() || loading) return;
        setLoading(true);
        void onOpen(url.trim()).finally(() => setLoading(false));
      }}
    >
      <header><strong>{t("بازکردن Markdown از نشانی")}</strong><button type="button" onClick={onClose} aria-label={t("بستن")}>×</button></header>
      <label><span>{t("نشانی")}</span><input type="url" value={url} autoFocus required placeholder="https://example.com/document.md" onChange={(event) => setUrl(event.currentTarget.value)} /></label>
      <p>{t("فقط فایل متنی Markdown تا حجم ۵ مگابایت پذیرفته می‌شود؛ سرور مقصد باید CORS را مجاز کرده باشد.")}</p>
      <footer><button type="button" onClick={onClose}>{t("لغو")}</button><button type="submit" disabled={loading || !url.trim()}>{loading ? t("در حال دریافت…") : t("بازکردن")}</button></footer>
    </form>
  );
}

function AppearanceSettings({
  theme,
  contentWidth,
  features,
  customThemeColors,
  filePreferences,
  onThemeChange,
  onContentWidthChange,
  onFeaturesChange,
  onCustomThemeColorsChange,
  onFilePreferencesChange,
  onExportSettings,
  onImportSettings,
  onClose,
}: {
  theme: "light" | "dark" | "auto";
  contentWidth: ContentWidth;
  features: Features;
  customThemeColors: CustomThemeColors;
  filePreferences: FilePreferences;
  onThemeChange: (theme: "light" | "dark" | "auto") => void;
  onContentWidthChange: (width: ContentWidth) => void;
  onFeaturesChange: (features: Features) => void;
  onCustomThemeColorsChange: (colors: CustomThemeColors) => void;
  onFilePreferencesChange: (preferences: FilePreferences) => void;
  onExportSettings: () => void;
  onImportSettings: (file: File) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useMarkdownI18n();
  const [section, setSection] = useState<"appearance" | "markdown" | "files">("appearance");
  const settingsFileRef = useRef<HTMLInputElement>(null);
  return (
    <aside className="tm-settings-popover" role="dialog" aria-modal="false" aria-label={t("تنظیمات")}>
      <header><strong>{t("تنظیمات")}</strong><button type="button" onClick={onClose} aria-label={t("بستن")}>×</button></header>
      <div className="tm-settings-tabs" role="tablist" aria-label={t("بخش تنظیمات")}>
        {(["appearance", "markdown", "files"] as const).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={section === id} onClick={() => setSection(id)}>
            {t(id === "appearance" ? "ظاهر" : id === "markdown" ? "Markdown" : "فایل‌ها")}
          </button>
        ))}
      </div>
      <div className="tm-settings-content" role="tabpanel">
        {section === "appearance" ? <>
          <label>
            <span>{t("پوسته")}</span>
            <select value={theme} onChange={(event) => onThemeChange(event.currentTarget.value as "light" | "dark" | "auto")}>
              <option value="auto">{t("خودکار (سیستم)")}</option><option value="light">{t("روشن")}</option><option value="dark">{t("تیره")}</option>
            </select>
          </label>
          <label>
            <span>{t("عرض متن")}</span>
            <select value={contentWidth} onChange={(event) => onContentWidthChange(event.currentTarget.value as ContentWidth)}>
              <option value="auto">{t("خودکار")}</option><option value="full">{t("تمام عرض")}</option><option value="wide">{t("خیلی عریض — ۱۴۰۰")}</option><option value="large">{t("عریض — ۱۲۰۰")}</option><option value="medium">{t("متوسط — ۹۹۲")}</option><option value="small">{t("باریک — ۷۶۸")}</option><option value="tiny">{t("خیلی باریک — ۵۷۶")}</option>
            </select>
          </label>
          <fieldset>
            <legend>{t("رنگ‌های سفارشی")}</legend>
            {(["accent", "background", "foreground"] as const).map((key) => (
              <label key={key}><span>{t(key === "accent" ? "رنگ تأکیدی" : key === "background" ? "پس‌زمینه" : "رنگ متن")}</span><span className="tm-settings-color"><input type="text" value={customThemeColors[key]} placeholder={t("رنگ CSS؛ مانند نام رنگ یا کد Hex")} onChange={(event) => onCustomThemeColorsChange({ ...customThemeColors, [key]: event.currentTarget.value })} /><button type="button" onClick={() => onCustomThemeColorsChange({ ...customThemeColors, [key]: "" })}>{t("پیش‌فرض")}</button></span></label>
            ))}
          </fieldset>
        </> : null}
        {section === "markdown" ? <>
          <fieldset>
            <legend>{t("رندر Markdown")}</legend>
            <label className="tm-settings-check"><input type="checkbox" checked={features.breaks === true} onChange={(event) => onFeaturesChange({ ...features, breaks: event.currentTarget.checked })} /><span>{t("تبدیل شکست خط نرم به خط جدید")}</span></label>
            <label className="tm-settings-check"><input type="checkbox" checked={features.linkify !== false} onChange={(event) => onFeaturesChange({ ...features, linkify: event.currentTarget.checked })} /><span>{t("لینک‌کردن خودکار نشانی‌ها")}</span></label>
            <label className="tm-settings-check"><input type="checkbox" checked={features.taskList !== false} onChange={(event) => onFeaturesChange({ ...features, taskList: event.currentTarget.checked })} /><span>{t("چک‌لیست تعاملی")}</span></label>
            <label className="tm-settings-check"><input type="checkbox" checked={features.footnotes !== false} onChange={(event) => onFeaturesChange({ ...features, footnotes: event.currentTarget.checked })} /><span>{t("نمایش پیشرفتهٔ پانویس")}</span></label>
            <label className="tm-settings-check"><input type="checkbox" checked={features.toc !== false} onChange={(event) => onFeaturesChange({ ...features, toc: event.currentTarget.checked })} /><span>{t("فهرست مطالب زنده")}</span></label>
            <label className="tm-settings-check"><input type="checkbox" checked={features.math !== false} onChange={(event) => onFeaturesChange({ ...features, math: event.currentTarget.checked })} /><span>{t("نمایش فرمول‌های ریاضی")}</span></label>
            <label className="tm-settings-check"><input type="checkbox" checked={features.mermaid === true} onChange={(event) => onFeaturesChange({ ...features, mermaid: event.currentTarget.checked })} /><span>{t("نمایش نمودارهای Mermaid")}</span></label>
            <label className="tm-settings-check"><input type="checkbox" checked={features.highlight !== false} onChange={(event) => onFeaturesChange({ ...features, highlight: event.currentTarget.checked })} /><span>{t("رنگ‌آمیزی کد")}</span></label>
            <label className="tm-settings-check"><input type="checkbox" checked={features.emoji === true} onChange={(event) => onFeaturesChange({ ...features, emoji: event.currentTarget.checked })} /><span>{t("تبدیل نام کوتاه Emoji")}</span></label>
          </fieldset>
          <label><span>{t("HTML خام")}</span><select value={features.html ?? "escape"} onChange={(event) => onFeaturesChange({ ...features, html: event.currentTarget.value as NonNullable<Features["html"]> })}><option value="escape">{t("نمایش به‌صورت متن (امن)")}</option><option value="sanitize">{t("رندر پاک‌سازی‌شده")}</option><option value="raw">{t("رندر بدون فیلتر (ناامن)")}</option></select></label>
        </> : null}
        {section === "files" ? <fieldset>
          <legend>{t("رفتار فایل‌ها")}</legend>
          <label className="tm-settings-check"><input type="checkbox" checked={filePreferences.confirmBeforeDiscard} onChange={(event) => onFilePreferencesChange({ ...filePreferences, confirmBeforeDiscard: event.currentTarget.checked })} /><span>{t("هشدار پیش از دورریختن تغییرات")}</span></label>
          <label className="tm-settings-check"><input type="checkbox" checked={filePreferences.watchExternalChanges} onChange={(event) => onFilePreferencesChange({ ...filePreferences, watchExternalChanges: event.currentTarget.checked })} /><span>{t("بررسی تغییر فایل بیرون از برنامه")}</span></label>
          <label className="tm-settings-check"><input type="checkbox" checked={filePreferences.restoreScrollPosition} onChange={(event) => onFilePreferencesChange({ ...filePreferences, restoreScrollPosition: event.currentTarget.checked })} /><span>{t("بازیابی محل مطالعهٔ هر فایل")}</span></label>
        </fieldset> : null}
      </div>
      <div className="tm-settings-actions">
        <button type="button" onClick={onExportSettings}>{t("خروجی گرفتن از تنظیمات")}</button>
        <button type="button" onClick={() => settingsFileRef.current?.click()}>{t("واردکردن تنظیمات…")}</button>
        <input ref={settingsFileRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void onImportSettings(file); }} />
      </div>
    </aside>
  );
}

function findOutlinePath(nodes: OutlineNode[], id: string): OutlineNode[] | null {
  for (const node of nodes) {
    if (node.id === id) return [node];
    const childPath = findOutlinePath(node.children, id);
    if (childPath) return [node, ...childPath];
  }
  return null;
}

/** نوارِ آمار — کلمه، کاراکتر، زمانِ خواندن. */
function StatsBar({
  view,
  wordsPerMinute,
}: {
  view: import("prosemirror-view").EditorView | null;
  wordsPerMinute: number;
}) {
  const { locale, t, number } = useMarkdownI18n();
  const s = view ? computeStats(view.state.doc, { wordsPerMinute }) : null;
  if (!s) return null;
  const duration = formatReadingDuration(s.readingMinutes, locale, number);
  return (
    <div className="tm-stats" aria-live="polite">
      <span>{number(s.words)} {t("کلمه")}</span>
      <span>{number(s.characters)} {t("کاراکتر")}</span>
      <span title={`${number(s.words)} ÷ ${number(s.wordsPerMinute)} ${t("کلمه")}/${t("دقیقه")}`}>
        {duration}
      </span>
    </div>
  );
}

function formatReadingDuration(
  minutes: number,
  locale: MarkdownLocale,
  number: (value: number) => string,
): string {
  if (minutes < 60) return locale === "en" ? `About ${number(minutes)} min read` : `حدود ${number(minutes)} دقیقه خواندن`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (locale === "en") return `About ${number(hours)} hr${rest ? ` ${number(rest)} min` : ""} read`;
  return `حدود ${number(hours)} ساعت${rest ? ` و ${number(rest)} دقیقه` : ""} خواندن`;
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
  wordsPerMinute,
  onClose,
}: {
  view: import("prosemirror-view").EditorView | null;
  wordsPerMinute: number;
  onClose: () => void;
}) {
  const { t } = useMarkdownI18n();
  const stats = view ? computeStats(view.state.doc, { wordsPerMinute }) : null;
  if (!stats) return null;
  return (
    <aside className="tm-word-count-popover" aria-label={t("شمارش کلمات")}>
      <StatsBar view={view} wordsPerMinute={wordsPerMinute} />
      <button type="button" onClick={onClose} aria-label={t("بستن شمارش کلمات")}>×</button>
    </aside>
  );
}
