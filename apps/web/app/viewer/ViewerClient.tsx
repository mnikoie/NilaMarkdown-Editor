"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, FileText, FolderOpen, ListTree, Moon, PanelRightClose, Pencil, Printer, Search, Sun, X } from "lucide-react";
import { MarkdownViewer, extractViewerHeadings, type ViewerHeading } from "nila-markdown/viewer";
import "nila-markdown/styles.css";
import "katex/dist/katex.min.css";

type ViewerTheme = "light" | "dark";
type SearchHighlightRect = { left: number; top: number; width: number; height: number; active: boolean };

export function ViewerClient({ initialMarkdown = "" }: { initialMarkdown?: string }) {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [fileName, setFileName] = useState(initialMarkdown ? "viewer-demo.md" : "");
  const [theme, setTheme] = useState<ViewerTheme>("dark");
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [activeMatch, setActiveMatch] = useState(0);
  const [fallbackRects, setFallbackRects] = useState<SearchHighlightRect[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLElement>(null);
  const matchRangesRef = useRef<Range[]>([]);
  const headings = useMemo(() => extractViewerHeadings(markdown), [markdown]);

  const clearHighlights = useCallback(() => {
    const registry = getHighlightRegistry();
    registry?.delete("nila-viewer-search");
    registry?.delete("nila-viewer-search-active");
    setFallbackRects([]);
    matchRangesRef.current = [];
  }, []);

  const highlightActive = useCallback((index: number, shouldScroll = true) => {
    const ranges = matchRangesRef.current;
    if (!ranges.length) return;
    const next = ((index % ranges.length) + ranges.length) % ranges.length;
    setActiveMatch(next);
    const registry = getHighlightRegistry();
    const HighlightClass = getHighlightConstructor();
    if (registry && HighlightClass) {
      registry.set("nila-viewer-search-active", new HighlightClass(ranges[next]!));
      setFallbackRects([]);
    } else {
      // Safariهای قدیمی و WebViewهایی که CSS Custom Highlight ندارند:
      // مستطیل‌های Range بدون دست‌کاری DOM روی متن قرار می‌گیرند.
      setFallbackRects(rectanglesForRanges(documentRef.current, ranges, next));
    }
    if (shouldScroll) scrollRangeIntoView(ranges[next]!);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const root = documentRef.current?.querySelector<HTMLElement>(".tm-viewer");
      clearHighlights();
      setMatchCount(0);
      setActiveMatch(0);
      if (!root || !searchOpen || !query.trim()) return;
      const ranges = findTextRanges(root, query);
      matchRangesRef.current = ranges;
      setMatchCount(ranges.length);
      const registry = getHighlightRegistry();
      const HighlightClass = getHighlightConstructor();
      if (registry && HighlightClass && ranges.length) {
        registry.set("nila-viewer-search", new HighlightClass(...ranges));
      }
      if (ranges.length) highlightActive(0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [clearHighlights, highlightActive, markdown, query, searchOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
      } else if (event.key === "Escape" && searchOpen) {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen]);

  useEffect(() => () => clearHighlights(), [clearHighlights]);

  const openFile = async (file: File) => {
    if (file.size > 5_000_000) {
      setNotice("حجم فایل باید کمتر از ۵ مگابایت باشد.");
      return;
    }
    if (!/\.(?:md|markdown|txt)$/i.test(file.name) && !file.type.startsWith("text/")) {
      setNotice("فقط فایل متنی Markdown قابل نمایش است.");
      return;
    }
    try {
      setMarkdown(await file.text());
      setFileName(file.name);
      setNotice(null);
      setQuery("");
    } catch {
      setNotice("خواندن فایل ممکن نشد.");
    }
  };

  const navigate = (heading: ViewerHeading) => {
    document.getElementById(heading.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="viewer-workspace" data-theme={theme} dir="rtl">
      <style>{`::highlight(nila-viewer-search){background:#ffe066;color:#111}::highlight(nila-viewer-search-active){background:#ff8c00;color:#111}`}</style>
      <header className="viewer-navbar">
        <div className="viewer-brand">
          <FileText size={19} aria-hidden />
          <strong>NilaMarkdown Viewer</strong>
          {fileName ? <span title={fileName}>{fileName}</span> : null}
        </div>
        <nav aria-label="ابزارهای نمایشگر">
          <button type="button" onClick={() => inputRef.current?.click()}>
            <FolderOpen size={17} aria-hidden />
            <span>بازکردن فایل</span>
          </button>
          <button type="button" aria-pressed={outlineOpen} onClick={() => setOutlineOpen((open) => !open)}>
            {outlineOpen ? <PanelRightClose size={17} aria-hidden /> : <ListTree size={17} aria-hidden />}
            <span>ساختار سند</span>
          </button>
          <button
            type="button"
            aria-label="جست‌وجو در سند"
            aria-pressed={searchOpen}
            onClick={() => {
              setSearchOpen((open) => !open);
              window.setTimeout(() => searchInputRef.current?.focus(), 0);
            }}
          >
            <Search size={17} aria-hidden />
            <span>جست‌وجو</span>
          </button>
          <button
            type="button"
            aria-label={theme === "dark" ? "حالت روشن" : "حالت تاریک"}
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
          </button>
          <button type="button" aria-label="چاپ سند" onClick={() => window.print()} disabled={!markdown.trim()}>
            <Printer size={17} aria-hidden />
            <span>چاپ</span>
          </button>
          <Link href="/markdown">
            <Pencil size={17} aria-hidden />
            <span>ویرایشگر</span>
          </Link>
        </nav>
      </header>

      <input
        ref={inputRef}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void openFile(file);
        }}
      />

      {notice ? <div className="viewer-notice" role="status">{notice}</div> : null}

      {searchOpen ? (
        <div className="viewer-searchbar" role="search" aria-label="جست‌وجو در متن سند">
          <Search size={17} aria-hidden />
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") highlightActive(activeMatch + (event.shiftKey ? -1 : 1));
            }}
            placeholder="جست‌وجو در سند…"
            aria-label="عبارت جست‌وجو"
          />
          <output aria-live="polite">
            {matchCount ? `${(activeMatch + 1).toLocaleString("fa-IR")} از ${matchCount.toLocaleString("fa-IR")}` : "۰ نتیجه"}
          </output>
          <button type="button" aria-label="نتیجه قبلی" disabled={!matchCount} onClick={() => highlightActive(activeMatch - 1)}><ArrowUp size={16} /></button>
          <button type="button" aria-label="نتیجه بعدی" disabled={!matchCount} onClick={() => highlightActive(activeMatch + 1)}><ArrowDown size={16} /></button>
          <button type="button" aria-label="بستن جست‌وجو" onClick={() => setSearchOpen(false)}><X size={16} /></button>
        </div>
      ) : null}

      <div className="viewer-layout" data-outline={outlineOpen ? "open" : "closed"}>
        {outlineOpen ? (
          <aside className="viewer-outline" aria-label="ساختار سند">
            <header>
              <ListTree size={17} aria-hidden />
              <strong>ساختار سند</strong>
              <span>{headings.length.toLocaleString("fa-IR")}</span>
            </header>
            {headings.length ? (
              <ol>
                {headings.map((heading) => (
                  <li key={heading.id} style={{ "--viewer-depth": heading.level } as CSSProperties}>
                    <button type="button" onClick={() => navigate(heading)} title={heading.title}>
                      {heading.title}
                    </button>
                  </li>
                ))}
              </ol>
            ) : <p>هنوز سرفصلی نیست.</p>}
          </aside>
        ) : null}

        <section ref={documentRef} className="viewer-document-scroll" aria-label="متن سند">
          {markdown.trim() ? (
            <MarkdownViewer
              value={markdown}
              theme={theme}
              dir="auto"
              locale="fa"
              features={{ math: true, highlight: true, mermaid: true }}
              className="viewer-document"
            />
          ) : (
            <div className="viewer-empty">
              <FileText size={44} aria-hidden />
              <h1>یک فایل Markdown باز کنید</h1>
              <p>نمایش امن و فقط‌خواندنی، بدون ابزارهای ویرایش.</p>
              <button type="button" onClick={() => inputRef.current?.click()}>
                <FolderOpen size={18} aria-hidden />
                انتخاب فایل
              </button>
            </div>
          )}
          {fallbackRects.length ? (
            <div className="viewer-search-fallback" aria-hidden="true">
              {fallbackRects.map((rect, index) => (
                <span
                  key={`${rect.left}-${rect.top}-${index}`}
                  data-active={rect.active ? "true" : "false"}
                  style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
                />
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

interface HighlightRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}

interface HighlightConstructor {
  new (...ranges: Range[]): unknown;
}

function getHighlightRegistry(): HighlightRegistry | null {
  return ((window.CSS as typeof CSS & { highlights?: HighlightRegistry }).highlights ?? null);
}

function getHighlightConstructor(): HighlightConstructor | null {
  return ((window as typeof window & { Highlight?: HighlightConstructor }).Highlight ?? null);
}

function normalizeSearchText(text: string): { text: string; offsets: number[] } {
  let normalized = "";
  const offsets: number[] = [];
  const replacements: Record<string, string> = {
    ي: "ی", ى: "ی", ئ: "ی", ك: "ک", ة: "ه",ۀ: "ه", ؤ: "و",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
    "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (/[ً-ٰٟ‌‍]/u.test(character)) continue;
    normalized += (replacements[character] ?? character).toLocaleLowerCase("fa-IR");
    offsets.push(index);
  }
  return { text: normalized, offsets };
}

function findTextRanges(root: HTMLElement, rawQuery: string): Range[] {
  const normalizedQuery = normalizeSearchText(rawQuery.trim()).text;
  if (!normalizedQuery) return [];
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!node.textContent?.trim() || parent?.closest("[aria-hidden='true'], script, style")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let textNode = walker.nextNode();
  while (textNode) {
    textNodes.push(textNode as Text);
    textNode = walker.nextNode();
  }

  // یک نمای پیوسته از متن می‌سازیم تا عبارت‌هایی که از مرزِ strong، link،
  // code و دیگر عناصر درون‌خطی عبور می‌کنند هم پیدا شوند. هر نویسهٔ نرمال‌شده
  // به جای دقیقش در DOM اشاره می‌کند، پس Range نهایی همچنان قابل برجسته‌سازی است.
  const positions: Array<{ node: Text; offset: number }> = [];
  let searchable = "";
  for (const node of textNodes) {
    const source = node.data;
    const normalized = normalizeSearchText(source);
    searchable += normalized.text;
    for (const offset of normalized.offsets) positions.push({ node, offset });
  }

  const ranges: Range[] = [];
  let from = 0;
  while (from <= searchable.length - normalizedQuery.length) {
    const match = searchable.indexOf(normalizedQuery, from);
    if (match < 0) break;
    const start = positions[match];
    const end = positions[match + normalizedQuery.length - 1];
    if (start && end) {
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset + 1);
      ranges.push(range);
    }
    from = match + Math.max(1, normalizedQuery.length);
  }
  return ranges;
}

function scrollRangeIntoView(range: Range) {
  const target = range.startContainer.parentElement;
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function rectanglesForRanges(container: HTMLElement | null, ranges: Range[], active: number): SearchHighlightRect[] {
  if (!container) return [];
  const containerBox = container.getBoundingClientRect();
  return ranges.flatMap((range, rangeIndex) =>
    [...range.getClientRects()]
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        left: rect.left - containerBox.left + container.scrollLeft,
        top: rect.top - containerBox.top + container.scrollTop,
        width: rect.width,
        height: rect.height,
        active: rangeIndex === active,
      })),
  );
}
