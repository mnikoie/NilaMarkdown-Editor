"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { FileText, FolderOpen, ListTree, Moon, PanelRightClose, Pencil, Sun } from "lucide-react";
import { MarkdownViewer, extractViewerHeadings, type ViewerHeading } from "@tamin/markdown/viewer";
import "@tamin/markdown/styles.css";

type ViewerTheme = "light" | "dark";

export function ViewerClient({ initialMarkdown = "" }: { initialMarkdown?: string }) {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [fileName, setFileName] = useState(initialMarkdown ? "viewer-demo.md" : "");
  const [theme, setTheme] = useState<ViewerTheme>("dark");
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const headings = useMemo(() => extractViewerHeadings(markdown), [markdown]);

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
    } catch {
      setNotice("خواندن فایل ممکن نشد.");
    }
  };

  const navigate = (heading: ViewerHeading) => {
    document.getElementById(heading.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="viewer-workspace" data-theme={theme} dir="rtl">
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
            aria-label={theme === "dark" ? "حالت روشن" : "حالت تاریک"}
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
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

        <section className="viewer-document-scroll" aria-label="متن سند">
          {markdown.trim() ? (
            <MarkdownViewer value={markdown} theme={theme} dir="auto" className="viewer-document" />
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
        </section>
      </div>
    </main>
  );
}
