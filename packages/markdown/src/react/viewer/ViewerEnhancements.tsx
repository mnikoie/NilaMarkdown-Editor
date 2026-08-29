"use client";

import { useEffect, useId, useState } from "react";
import { highlight } from "../../core/highlight/client.js";

export interface ViewerFeatures {
  /** رندر فرمول با KaTeX؛ در نبود dependency متن خام حفظ می‌شود. */
  math?: boolean;
  /** رنگ‌آمیزی کد در Web Worker؛ رشتهٔ اصلی را مسدود نمی‌کند. */
  highlight?: boolean;
  /** رندر امن نمودار با Mermaid. */
  mermaid?: boolean;
}

interface ViewerCodeBlockProps {
  code: string;
  lang?: string | null;
  features: Required<ViewerFeatures>;
  theme: "light" | "dark" | "auto";
  locale: "fa" | "en";
}

export function ViewerCodeBlock({ code, lang, features, theme, locale }: ViewerCodeBlockProps) {
  const language = (lang ?? "").trim().toLowerCase();
  const [html, setHtml] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let current = true;
    setHtml(null);
    if (!features.highlight || !language || language === "mermaid") {
      setPending(false);
      return () => { current = false; };
    }
    setPending(true);
    void highlight(code, language).then((result) => {
      if (!current) return;
      setHtml(result?.html ?? null);
      setPending(false);
    });
    return () => { current = false; };
  }, [code, features.highlight, language]);

  if (language === "mermaid" && features.mermaid) {
    return <ViewerMermaid code={code} theme={theme} locale={locale} />;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <figure
      className="tm-viewer-code"
      data-highlighted={html ? "true" : pending ? "pending" : "false"}
    >
      <figcaption>
        <span>{language || (locale === "en" ? "text" : "متن")}</span>
        <button type="button" onClick={() => void copy()}>
          {copied ? (locale === "en" ? "Copied" : "کپی شد") : (locale === "en" ? "Copy" : "کپی")}
        </button>
      </figcaption>
      {html ? (
        <div className="tm-viewer-highlight" dir="ltr" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre dir="ltr"><code>{code}</code></pre>
      )}
    </figure>
  );
}

interface ViewerMathProps {
  tex: string;
  displayMode: boolean;
  enabled: boolean;
}

export function ViewerMath({ tex, displayMode, enabled }: ViewerMathProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setHtml(null);
    if (!enabled || !tex.trim()) return () => { current = false; };

    void import("katex")
      .then((module) => {
        if (!current) return;
        const katex = module.default ?? module;
        setHtml(katex.renderToString(tex, {
          displayMode,
          throwOnError: false,
          strict: "warn",
          trust: false,
          output: "htmlAndMathml",
        }));
      })
      .catch(() => {
        if (current) setHtml(null);
      });

    return () => { current = false; };
  }, [displayMode, enabled, tex]);

  const Tag = displayMode ? "div" : "span";
  const fallback = displayMode ? `$$${tex}$$` : `$${tex}$`;
  return html ? (
    <Tag className={displayMode ? "tm-viewer-math-block" : "tm-viewer-math-inline"} data-rendered="true" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <Tag className={displayMode ? "tm-viewer-math-block" : "tm-viewer-math-inline"} data-rendered="false">{fallback}</Tag>
  );
}

interface MermaidModule {
  initialize(config: Record<string, unknown>): void;
  render(id: string, code: string, container?: Element): Promise<{ svg: string }>;
}

let mermaidSequence = 0;
let mermaidQueue: Promise<void> = Promise.resolve();

function sanitizeMermaidSvg(svg: string): string {
  const documentNode = new DOMParser().parseFromString(svg, "image/svg+xml");
  documentNode.querySelectorAll("script, iframe, object, embed, foreignObject").forEach((node) => node.remove());
  documentNode.querySelectorAll("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || ((name === "href" || name === "xlink:href") && value.startsWith("javascript:"))) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  return new XMLSerializer().serializeToString(documentNode.documentElement);
}

function ViewerMermaid({ code, theme, locale }: { code: string; theme: "light" | "dark" | "auto"; locale: "fa" | "en" }) {
  const reactId = useId();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    setSvg(null);
    setFailed(false);
    const resolvedTheme = theme === "auto"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default")
      : (theme === "dark" ? "dark" : "default");

    mermaidQueue = mermaidQueue.then(async () => {
      const scratch = document.createElement("div");
      scratch.setAttribute("aria-hidden", "true");
      scratch.style.cssText = "position:fixed;inset:0;width:1px;height:1px;overflow:hidden;visibility:hidden;pointer-events:none";
      document.body.append(scratch);
      try {
        const module = await import("mermaid");
        const mermaid = (module.default ?? module) as MermaidModule;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          htmlLabels: false,
          suppressErrorRendering: true,
          theme: resolvedTheme,
        });
        const id = `tm-viewer-mermaid-${reactId.replace(/[^a-z0-9]/gi, "")}-${mermaidSequence++}`;
        const result = await mermaid.render(id, code, scratch);
        if (current) setSvg(sanitizeMermaidSvg(result.svg));
      } catch {
        if (current) setFailed(true);
      } finally {
        scratch.remove();
      }
    });

    return () => { current = false; };
  }, [code, reactId, theme]);

  return (
    <figure className="tm-viewer-mermaid" data-rendered={svg ? "true" : failed ? "false" : "pending"}>
      <figcaption>{locale === "en" ? "Diagram" : "نمودار"}</figcaption>
      {svg ? <div className="tm-viewer-mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} /> : null}
      {!svg && !failed ? <p role="status">{locale === "en" ? "Rendering diagram…" : "در حال رندر نمودار…"}</p> : null}
      {failed ? <p role="status">{locale === "en" ? "The diagram could not be rendered; source is preserved below." : "نمودار رندر نشد؛ سورس آن در ادامه محفوظ است."}</p> : null}
      <details open={failed}>
        <summary>{locale === "en" ? "Diagram source" : "سورس نمودار"}</summary>
        <pre dir="ltr"><code>{code}</code></pre>
      </details>
    </figure>
  );
}
