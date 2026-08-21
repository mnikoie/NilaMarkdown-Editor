import { unified } from "unified";
import type { Processor } from "unified";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import { directiveToMarkdown } from "mdast-util-directive";
import type { Node as PMNode, Mark } from "prosemirror-model";

/**
 * جایگزینِ `remark-directive` در مسیرِ نوشتن.
 *
 * `remark-directive` هیچ گزینه‌ای نمی‌گیرد و `directiveToMarkdown()` را
 * بی‌آرگومان صدا می‌زند — یعنی `preferUnquoted` به آن نمی‌رسد و همهٔ صفات
 * گیومه‌دار می‌شوند. پس افزونه را خودمان با گزینه ثبت می‌کنیم.
 * (در مسیرِ خواندن، `parse.ts`، همان `remark-directive` کافی است.)
 */
function directiveWriter(this: Processor) {
  const data = this.data();
  const toMarkdownExtensions =
    data.toMarkdownExtensions || (data.toMarkdownExtensions = []);
  toMarkdownExtensions.push(
    directiveToMarkdown({
      // `{نوع=compiler}` نه `{نوع="compiler"}` — وگرنه سندی که کاربر
      // بی‌گیومه نوشته، بعدِ اولین ذخیره کلاً گیومه‌دار می‌شود.
      // خودِ افزونه هر مقداری که کاراکترِ خطرناک داشته باشد را باز هم
      // گیومه می‌گذارد، پس این ناامن نیست.
      preferUnquoted: true,
    }),
  );
}

/**
 * سندِ ProseMirror → mdast → Markdown.
 *
 * انتخاب‌های ثابتِ سریالایزر (بندِ ۵ پرامپت: «انتخابِ خودت را ثابت کن و در
 * README بنویس»). اینها فقط وقتی اثر دارند که گره از خودش نشانه‌ای نیاورده
 * باشد — مثلاً بلوکی که تازه با دکمهٔ نوارِ ابزار ساخته شده.
 */
const STRINGIFY_OPTIONS = {
  bullet: "-" as const,
  emphasis: "*" as const,
  strong: "*" as const,
  fence: "`" as const,
  fences: true,
  rule: "-" as const,
  listItemIndent: "one" as const,
  // `bulletOther` عمداً اینجا نیست: باید همیشه با `bullet` فرق کند و
  // `bullet` بسته به سند عوض می‌شود. در `serialize()` جفتشان با هم
  // تعیین می‌شوند.
} as const;

/** نشانهٔ جایگزین — باید همیشه با نشانهٔ اصلی فرق کند وگرنه remark خطا می‌دهد. */
function otherBullet(bullet: string): "-" | "*" {
  return bullet === "-" ? "*" : "-";
}

/**
 * گزینه‌های جدول به `remark-gfm` می‌روند، نه `remark-stringify`.
 *
 * پیش‌فرضِ remark ردیفِ جداکننده را فشرده می‌کند (`| --- | - |`) که با
 * چیزی که کاربر نوشته یکی نیست و کلِ جدول را در diff می‌آورد.
 */
const GFM_OPTIONS = { tablePipeAlign: false, tableCellPadding: true } as const;

const processor = unified()
  .use(remarkGfm, GFM_OPTIONS)
  .use(remarkMath)
  .use(remarkFrontmatter, ["yaml"])
  .use(directiveWriter)
  .use(remarkStringify, STRINGIFY_OPTIONS);

interface MdastNode {
  type: string;
  [k: string]: unknown;
}

const ALERT_SENTINEL = "TAMINALERT";
const TOC_SENTINEL = "TAMINTABLEOFCONTENTS";

/** نشانه‌های فعالِ یک متن را به گره‌های تودرتوی mdast تبدیل می‌کند. */
function applyMarks(text: string, marks: readonly Mark[]): MdastNode {
  let node: MdastNode = { type: "text", value: text };
  // ترتیب مهم است: code داخلی‌ترین، link بیرونی‌ترین.
  const ordered = [...marks].sort((a, b) => order(a) - order(b));
  for (const m of ordered) {
    switch (m.type.name) {
      case "code":
        node = { type: "inlineCode", value: text };
        break;
      case "strong":
        node = { type: "strong", children: [node] };
        break;
      case "em":
        node = { type: "emphasis", children: [node] };
        break;
      case "strike":
        node = { type: "delete", children: [node] };
        break;
      case "link":
        node = m.attrs.identifier
          ? {
              type: "linkReference",
              identifier: m.attrs.identifier,
              label: m.attrs.identifier,
              referenceType: m.attrs.referenceType ?? "full",
              children: [node],
            }
          : {
              type: "link",
              url: m.attrs.href ?? m.attrs.url ?? "",
              title: m.attrs.title ?? null,
              children: [node],
            };
        break;
    }
  }
  return node;
}

function order(m: Mark): number {
  const rank: Record<string, number> = { code: 0, strike: 1, em: 2, strong: 3, link: 4 };
  return rank[m.type.name] ?? 5;
}

function inlineOf(node: PMNode): MdastNode[] {
  const out: MdastNode[] = [];
  node.forEach((child) => {
    if (child.isText) {
      out.push(applyMarks(child.text ?? "", child.marks));
      return;
    }
    switch (child.type.name) {
      case "image":
        out.push({
          type: "image",
          url: child.attrs.src,
          alt: child.attrs.alt ?? null,
          title: child.attrs.title ?? null,
        });
        break;
      case "hard_break":
        out.push({ type: "break" });
        break;
      case "math_inline":
        out.push({ type: "inlineMath", value: child.attrs.value });
        break;
      case "footnote_reference":
        out.push({
          type: "footnoteReference",
          identifier: child.attrs.identifier,
          label: child.attrs.label ?? child.attrs.identifier,
        });
        break;
      case "directive_inline":
        out.push({
          type: "textDirective",
          name: child.attrs.name,
          attributes: child.attrs.attributes ?? {},
          children: inlineOf(child),
        });
        break;
      default:
        out.push(...inlineOf(child));
    }
  });
  return out;
}

function blockOf(node: PMNode): MdastNode[] {
  const out: MdastNode[] = [];
  node.forEach((child) => {
    switch (child.type.name) {
      case "paragraph":
        out.push({ type: "paragraph", children: inlineOf(child) });
        break;

      case "heading": {
        const kids = inlineOf(child);
        // لنگرِ صریح دوباره به انتهای عنوان برمی‌گردد. بی این، `{#fasl-4}`
        // بعدِ اولین ذخیره گم می‌شود و همهٔ ارجاع‌های واردشونده می‌شکنند.
        if (child.attrs.id) {
          kids.push({ type: "text", value: ` {#${child.attrs.id as string}}` });
        }
        out.push({ type: "heading", depth: child.attrs.level, children: kids });
        break;
      }

      case "blockquote":
        out.push({ type: "blockquote", children: blockOf(child) });
        break;

      case "horizontal_rule":
        out.push({ type: "thematicBreak" });
        break;

      case "code_block":
        out.push({
          type: "code",
          lang: child.attrs.language ?? null,
          meta: child.attrs.meta ?? null,
          value: child.textContent,
        });
        break;

      case "bullet_list":
      case "ordered_list": {
        const items: MdastNode[] = [];
        child.forEach((li) => {
          items.push({
            type: "listItem",
            checked: li.attrs.checked ?? null,
            spread: li.attrs.spread ?? false,
            children: blockOf(li),
          });
        });
        out.push({
          type: "list",
          ordered: child.type.name === "ordered_list",
          start: child.type.name === "ordered_list" ? child.attrs.start : null,
          spread: child.attrs.spread ?? false,
          children: items,
        });
        break;
      }

      case "table": {
        // تراز از ردیفِ اول بازسازی می‌شود — mdast آن را به‌ازای ستون
        // می‌خواهد، نه سلول.
        const first = child.firstChild;
        const align: (string | null)[] = [];
        first?.forEach((cell) => align.push((cell.attrs.align as string) ?? null));

        const rows: MdastNode[] = [];
        child.forEach((row) => {
          const cells: MdastNode[] = [];
          row.forEach((cell) => {
            cells.push({ type: "tableCell", children: inlineOf(cell) });
          });
          rows.push({ type: "tableRow", children: cells });
        });

        out.push({ type: "table", align, children: rows });
        break;
      }

      case "directive_block": {
        const children = blockOf(child);
        if (
          child.attrs.syntax === "alert" &&
          ["note", "tip", "important", "warning", "caution"].includes(child.attrs.name)
        ) {
          children.unshift({
            type: "paragraph",
            children: [{ type: "text", value: `${ALERT_SENTINEL}${String(child.attrs.name).toUpperCase()}` }],
          });
          out.push({ type: "blockquote", children });
          break;
        }
        if (child.attrs.label) {
          children.unshift({
            type: "paragraph",
            data: { directiveLabel: true },
            children: [{ type: "text", value: child.attrs.label }],
          });
        }
        out.push({
          type: "containerDirective",
          name: child.attrs.name,
          attributes: child.attrs.attributes ?? {},
          children,
        });
        break;
      }

      case "directive_leaf":
        out.push({
          type: "leafDirective",
          name: child.attrs.name,
          attributes: child.attrs.attributes ?? {},
          children: child.attrs.label
            ? [{ type: "text", value: child.attrs.label }]
            : [],
        });
        break;

      case "math_block":
        out.push({ type: "math", value: child.attrs.value });
        break;

      case "footnote_definition":
        out.push({
          type: "footnoteDefinition",
          identifier: child.attrs.identifier,
          label: child.attrs.label ?? child.attrs.identifier,
          children: blockOf(child),
        });
        break;

      case "link_definition":
        out.push({
          type: "definition",
          identifier: child.attrs.identifier,
          label: child.attrs.identifier,
          url: child.attrs.url,
          title: child.attrs.title ?? null,
        });
        break;

      case "table_of_contents":
        out.push({
          type: "paragraph",
          children: [{ type: "text", value: TOC_SENTINEL }],
        });
        break;

      case "front_matter":
        out.push({ type: "yaml", value: child.attrs.value || child.textContent });
        break;

      case "html_block":
        out.push({ type: "html", value: child.attrs.value });
        break;

      default:
        out.push(...blockOf(child));
    }
  });
  return out;
}

export function toMdastFromDoc(doc: PMNode): MdastNode {
  return { type: "root", children: blockOf(doc) };
}

/**
 * نشانه‌هایی که یک بلوک از خودش آورده، فقط برای همان بلوک اعمال می‌شوند.
 *
 * چرا این‌طور و نه یک گزینهٔ سراسری: در یک سند ممکن است هم `- یک` باشد هم
 * `* دو`. گزینهٔ سراسریِ remark هر دو را یک‌دست می‌کند. پس هر گره با
 * نشانهٔ خودش جدا سریالایز می‌شود و نتیجه‌ها کنارِ هم چیده می‌شوند.
 */
function stringifyWith(tree: MdastNode, overrides: Record<string, unknown>): string {
  const p = unified()
    .use(remarkGfm, GFM_OPTIONS)
    .use(remarkMath)
    .use(remarkFrontmatter, ["yaml"])
    .use(directiveWriter)
    .use(remarkStringify, { ...STRINGIFY_OPTIONS, ...overrides });
  return p.stringify(tree as never) as string;
}

/** نشانه‌های به‌کاررفته در سند را جمع می‌کند تا بدانیم یک‌دست است یا نه. */
function collectMarkers(doc: PMNode) {
  const bullets = new Set<string>();
  const strongs = new Set<string>();
  const ems = new Set<string>();
  doc.descendants((n) => {
    if (n.type.name === "bullet_list") bullets.add((n.attrs.marker as string) ?? "-");
    for (const m of n.marks) {
      if (m.type.name === "strong") strongs.add((m.attrs.marker as string) ?? "**");
      if (m.type.name === "em") ems.add((m.attrs.marker as string) ?? "*");
    }
    return true;
  });
  return { bullets, strongs, ems };
}

/** ورودیِ اصلی: سندِ ProseMirror → مارک‌داون. */
export function serialize(doc: PMNode): string {
  const tree = toMdastFromDoc(doc);
  const { bullets, strongs, ems } = collectMarkers(doc);

  // وقتی کلِ سند یک نشانه دارد، همان را به remark می‌دهیم. سندِ مخلوط
  // نادر است و در آن حالت به پیش‌فرض برمی‌گردیم (هنوز معتبر است، فقط
  // ممکن است یک نشانه عوض شود).
  const overrides: Record<string, unknown> = {};
  if (bullets.size === 1) {
    const b = [...bullets][0];
    overrides.bullet = b;
    overrides.bulletOther = otherBullet(b);
  }
  if (strongs.size === 1) overrides.strong = [...strongs][0][0];
  if (ems.size === 1) overrides.emphasis = [...ems][0][0];

  return stringifyWith(tree, overrides)
    .replace(new RegExp(`^> ${ALERT_SENTINEL}([A-Z]+)$`, "gm"), "> [!$1]")
    .replace(new RegExp(`^${TOC_SENTINEL}$`, "gm"), "[TOC]");
}
