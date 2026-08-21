import type { Node as PMNode } from "prosemirror-model";
import { buildOutline, flattenOutline } from "./outline/build.js";
import type { MarkRegistry } from "./directives/types.js";
import { BUILTIN_MARKS } from "./directives/builtin.js";
import { escapeHtml, safeHref, isSafeImageSrc, processHtml, type HtmlMode } from "./security.js";

/**
 * خروجیِ HTML.
 *
 * ★ چرا `DOMSerializer`ِ ProseMirror را مستقیم استفاده نمی‌کنیم: آن برای
 * **ویرایش** ساخته شده و کلاس‌ها و `contenteditable` و گره‌های کمکی
 * می‌گذارد. خروجیِ اشتراکی باید HTMLِ تمیز و مستقل باشد که در ایمیل و
 * چاپ هم درست دیده شود.
 *
 * ★ امنیت: همان قواعدِ بندِ ۱۱ اینجا هم اعمال می‌شوند. خروجیِ HTML جایی
 * است که XSS واقعاً خطرناک می‌شود، چون فایل ممکن است دستِ کسِ دیگری
 * برود.
 */

export interface ExportHtmlOptions {
  /** تعریفِ مارک‌ها — برای رنگ و برچسبِ کارت‌ها. */
  directives?: MarkRegistry;
  /** رفتار با HTMLِ خامِ داخلِ سند. پیش‌فرض `escape`. */
  html?: HtmlMode;
  /** سندِ کامل با `<head>` بساز، نه فقط قطعه. پیش‌فرض `true`. */
  standalone?: boolean;
  title?: string;
  dir?: "rtl" | "ltr";
  lang?: string;
  /** فهرستِ مطالب در ابتدای سند. */
  toc?: boolean;
  /** CSSِ دلخواه به‌جای پیش‌فرض. */
  css?: string;
}

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toFa(n: number): string {
  return String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]!);
}

/** متنِ درون‌خطی با markها. */
function inlineHtml(node: PMNode, options: Required<Pick<ExportHtmlOptions, "html">>): string {
  let out = "";

  node.forEach((child) => {
    if (child.isText) {
      let text = escapeHtml(child.text ?? "");
      // از داخلی به بیرونی — ترتیبِ برعکسِ marks.
      for (const mark of [...child.marks].reverse()) {
        switch (mark.type.name) {
          case "code":
            text = `<code>${text}</code>`;
            break;
          case "strong":
            text = `<strong>${text}</strong>`;
            break;
          case "em":
            text = `<em>${text}</em>`;
            break;
          case "strike":
            text = `<s>${text}</s>`;
            break;
          case "link": {
            const href = escapeHtml(safeHref((mark.attrs.href as string) ?? ""));
            const title = mark.attrs.title ? ` title="${escapeHtml(mark.attrs.title as string)}"` : "";
            // لینکِ خارجی: `rel` امن — بندِ ۱۱.
            const external = /^https?:/i.test((mark.attrs.href as string) ?? "");
            const rel = external ? ' rel="noopener noreferrer"' : "";
            text = `<a href="${href}"${title}${rel}>${text}</a>`;
            break;
          }
        }
      }
      out += text;
      return;
    }

    switch (child.type.name) {
      case "image": {
        const src = (child.attrs.src as string) ?? "";
        if (!isSafeImageSrc(src)) break; // ناامن → رندر نشو
        const alt = escapeHtml((child.attrs.alt as string) ?? "");
        const title = child.attrs.title ? ` title="${escapeHtml(child.attrs.title as string)}"` : "";
        out += `<img src="${escapeHtml(src)}" alt="${alt}"${title}>`;
        break;
      }
      case "hard_break":
        out += "<br>";
        break;
      case "math_inline":
        // KaTeX در خروجی نیست؛ فرمولِ خام با نشانه.
        out += `<span class="tm-math">${escapeHtml(`$${child.attrs.value as string}$`)}</span>`;
        break;
      case "footnote_reference": {
        const id = escapeHtml((child.attrs.identifier as string) ?? "");
        out += `<sup class="tm-fn-ref" id="fnref-${id}"><a href="#fn-${id}">[${id}]</a></sup>`;
        break;
      }
      case "directive_inline": {
        const name = escapeHtml((child.attrs.name as string) ?? "");
        out += `<span class="tm-inline-mark" data-mark="${name}">${inlineHtml(child, options)}</span>`;
        break;
      }
      default:
        out += inlineHtml(child, options);
    }
  });

  return out;
}

function blockHtml(
  node: PMNode,
  options: Required<Pick<ExportHtmlOptions, "html" | "directives">>,
  depth = 0,
): string {
  let out = "";
  const pad = "  ".repeat(depth);

  node.forEach((child) => {
    const name = child.type.name;

    switch (name) {
      case "paragraph":
        out += `${pad}<p>${inlineHtml(child, options)}</p>\n`;
        break;

      case "heading": {
        const level = child.attrs.level as number;
        const id = child.attrs.id ? ` id="${escapeHtml(child.attrs.id as string)}"` : "";
        out += `${pad}<h${level}${id}>${inlineHtml(child, options)}</h${level}>\n`;
        break;
      }

      case "blockquote":
        out += `${pad}<blockquote>\n${blockHtml(child, options, depth + 1)}${pad}</blockquote>\n`;
        break;

      case "horizontal_rule":
        out += `${pad}<hr>\n`;
        break;

      case "code_block": {
        const lang = (child.attrs.language as string) ?? "";
        const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
        out += `${pad}<pre><code${cls}>${escapeHtml(child.textContent)}</code></pre>\n`;
        break;
      }

      case "bullet_list":
      case "ordered_list": {
        const tag = name === "ordered_list" ? "ol" : "ul";
        const start =
          name === "ordered_list" && child.attrs.start !== 1
            ? ` start="${child.attrs.start as number}"`
            : "";
        out += `${pad}<${tag}${start}>\n${blockHtml(child, options, depth + 1)}${pad}</${tag}>\n`;
        break;
      }

      case "list_item": {
        const checked = child.attrs.checked;
        const box =
          checked === null || checked === undefined
            ? ""
            : `<input type="checkbox" disabled${checked ? " checked" : ""}> `;
        // بندِ تک‌پاراگرافی نباید `<p>` بگیرد — فهرست را شل می‌کند.
        const inner =
          child.childCount === 1 && child.firstChild?.type.name === "paragraph"
            ? inlineHtml(child.firstChild, options)
            : `\n${blockHtml(child, options, depth + 1)}${pad}`;
        out += `${pad}<li>${box}${inner}</li>\n`;
        break;
      }

      case "table": {
        out += `${pad}<table>\n`;
        let first = true;
        child.forEach((row) => {
          const tag = first ? "th" : "td";
          out += `${pad}  <tr>\n`;
          row.forEach((cell) => {
            const align = cell.attrs.align
              ? ` style="text-align: ${escapeHtml(cell.attrs.align as string)}"`
              : "";
            out += `${pad}    <${tag}${align}>${inlineHtml(cell, options)}</${tag}>\n`;
          });
          out += `${pad}  </tr>\n`;
          first = false;
        });
        out += `${pad}</table>\n`;
        break;
      }

      case "directive_block": {
        const markName = (child.attrs.name as string) ?? "";
        const def = options.directives[markName];
        const attrs = (child.attrs.attributes ?? {}) as Record<string, string>;
        const label = def?.label ?? markName;
        const num = attrs["شماره"] ? ` ${attrs["شماره"]}` : "";
        const status = attrs["وضعیت"] ? ` data-status="${escapeHtml(attrs["وضعیت"])}"` : "";
        // رنگ به‌صورتِ متغیرِ درون‌خطی — همان مکانیزمِ ادیتور.
        const color = def?.color ? ` style="--tm-mark-base: ${escapeHtml(def.color)}"` : "";

        out += `${pad}<section class="tm-mark" data-mark="${escapeHtml(markName)}"${status}${color}>\n`;
        out += `${pad}  <div class="tm-mark-header">${escapeHtml(label + num)}</div>\n`;
        out += `${pad}  <div class="tm-mark-body">\n${blockHtml(child, options, depth + 2)}${pad}  </div>\n`;
        out += `${pad}</section>\n`;
        break;
      }

      case "directive_leaf":
        out += `${pad}<div class="tm-mark-leaf" data-mark="${escapeHtml((child.attrs.name as string) ?? "")}"></div>\n`;
        break;

      case "math_block":
        out += `${pad}<div class="tm-math-block">${escapeHtml(`$$${child.attrs.value as string}$$`)}</div>\n`;
        break;

      case "footnote_definition": {
        const id = escapeHtml((child.attrs.identifier as string) ?? "");
        out += `${pad}<div class="tm-fn-def" id="fn-${id}">\n`;
        out += `${pad}  <span class="tm-fn-num">[${id}]</span>\n`;
        out += blockHtml(child, options, depth + 1);
        out += `${pad}  <a href="#fnref-${id}" class="tm-fn-back">↩</a>\n`;
        out += `${pad}</div>\n`;
        break;
      }

      case "html_block":
        out += `${pad}${processHtml((child.attrs.value as string) ?? "", options.html)}\n`;
        break;

      case "front_matter":
        // متادیتا در خروجیِ خواندنی نمی‌آید.
        break;

      case "link_definition":
      case "table_of_contents":
        // definition در hrefِ خودِ لینک حل شده و TOC در حلقهٔ اصلی
        // به کلِ سند نیاز دارد؛ اینجا چیزی رندر نمی‌شود.
        break;

      default:
        out += blockHtml(child, options, depth);
    }
  });

  return out;
}

/** CSSِ پیش‌فرضِ خروجی — مستقل، بی وابستگی. */
const DEFAULT_CSS = `
:root {
  --tm-bg: #ffffff;
  --tm-fg: #1f2328;
  --tm-muted: #656d76;
  --tm-accent: #0969da;
  --tm-border: #d1d9e0;
  --tm-code-bg: #f6f8fa;
}
@media (prefers-color-scheme: dark) {
  :root {
    --tm-bg: #0d1117; --tm-fg: #e6edf3; --tm-muted: #8d96a0;
    --tm-accent: #4493f8; --tm-border: #3d444d; --tm-code-bg: #161b22;
  }
}
body {
  max-width: 68ch; margin: 2rem auto; padding: 0 1rem;
  font-family: Vazirmatn, system-ui, sans-serif;
  line-height: 1.75; color: var(--tm-fg); background: var(--tm-bg);
}
pre, code { font-family: ui-monospace, Consolas, monospace; direction: ltr; }
pre { background: var(--tm-code-bg); padding: .75rem; border-radius: .5rem; overflow-x: auto; }
code { background: var(--tm-code-bg); padding: .1em .3em; border-radius: .25rem; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { border: 1px solid var(--tm-border); padding: .375rem .625rem; }
th { background: var(--tm-code-bg); }
blockquote { border-inline-start: 3px solid var(--tm-border); margin-inline: 0; padding-inline-start: 1rem; color: var(--tm-muted); }
a { color: var(--tm-accent); }
img { max-width: 100%; height: auto; }
.tm-mark {
  --tm-mark-base: var(--tm-accent);
  background: color-mix(in oklab, var(--tm-mark-base) 10%, var(--tm-bg));
  border-inline-start: 3px solid color-mix(in oklab, var(--tm-mark-base) 40%, var(--tm-bg));
  border-radius: .5rem; margin: 1rem 0;
}
.tm-mark-header {
  padding: .5rem .75rem; font-weight: 600; font-size: .875rem;
  color: color-mix(in oklab, var(--tm-mark-base) 75%, var(--tm-fg));
}
.tm-mark-body { padding: 0 .75rem .75rem; }
.tm-mark-body > :first-child { margin-top: 0; }
.tm-mark[data-status="منسوخ"] .tm-mark-header::after {
  content: " (منسوخ)"; color: #dc2626; font-weight: 400;
}
.tm-fn-ref, .tm-fn-num { color: var(--tm-accent); font-size: .75em; unicode-bidi: isolate; }
.tm-fn-def { display: flex; gap: .5rem; font-size: .875rem; color: var(--tm-muted); }
.tm-fn-def > :first-child { margin-top: 0; }
.tm-toc { background: var(--tm-code-bg); border-radius: .5rem; padding: 1rem 1.5rem; }
.tm-toc ul { margin: 0; padding-inline-start: 1.25rem; }
@media print {
  body { max-width: none; }
  .tm-mark { break-inside: avoid; background: none; }
  a[href^="http"]::after { content: " (" attr(href) ")"; font-size: .8em; color: #666; }
}
`.trim();

/** فهرستِ مطالب از درختِ ساختار. */
function tocHtml(doc: PMNode, registry: MarkRegistry): string {
  const tree = buildOutline(doc, registry);
  if (tree.length === 0) return "";

  const render = (nodes: ReturnType<typeof buildOutline>): string => {
    if (nodes.length === 0) return "";
    let out = "<ul>\n";
    for (const n of nodes) {
      out += `<li><a href="#${escapeHtml(n.id)}">${escapeHtml(n.title)}</a>`;
      out += render(n.children);
      out += "</li>\n";
    }
    return out + "</ul>\n";
  };

  return `<nav class="tm-toc" aria-label="فهرستِ مطالب">\n<strong>فهرست</strong>\n${render(tree)}</nav>\n`;
}

/**
 * سند را به HTML تبدیل می‌کند.
 *
 * ★ لنگرهای سرفصل در خروجی هم می‌آیند، پس ارجاع‌های `#fasl-4` بینِ
 * فایل‌های صادرشده هم کار می‌کنند.
 */
export function exportHtml(doc: PMNode, options: ExportHtmlOptions = {}): string {
  const {
    directives = BUILTIN_MARKS,
    html = "escape",
    standalone = true,
    title = "",
    dir = "rtl",
    lang = "fa",
    toc = false,
    css = DEFAULT_CSS,
  } = options;

  const resolved = { html, directives };

  // لنگرِ خودکار برای سرفصل‌هایی که `id` صریح ندارند — وگرنه فهرستِ
  // مطالب به جایی اشاره می‌کند که وجود ندارد.
  const outline = flattenOutline(buildOutline(doc, directives));
  const anchors = new Map<number, string>();
  for (const node of outline) anchors.set(node.from, node.id);

  let body = "";
  doc.forEach((child, offset) => {
    if (child.type.name === "table_of_contents") {
      body += tocHtml(doc, directives);
    } else if (child.type.name === "heading" && !child.attrs.id && anchors.has(offset)) {
      const withId = child.type.create({ ...child.attrs, id: anchors.get(offset) }, child.content);
      body += blockHtml(doc.type.schema.nodes.doc.create(null, [withId]), resolved);
    } else {
      body += blockHtml(doc.type.schema.nodes.doc.create(null, [child]), resolved);
    }
  });

  const content = (toc ? tocHtml(doc, directives) : "") + body;

  if (!standalone) return content;

  return `<!doctype html>
<html lang="${escapeHtml(lang)}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${css}
</style>
</head>
<body>
${content}</body>
</html>
`;
}

/** برای نمایشِ تعداد در UI. */
export function exportStats(doc: PMNode, registry: MarkRegistry = BUILTIN_MARKS) {
  const tree = flattenOutline(buildOutline(doc, registry));
  return {
    headings: tree.filter((n) => n.kind === "heading").length,
    structural: tree.filter((n) => n.kind !== "heading").length,
    label: `${toFa(tree.length)} گره`,
  };
}
