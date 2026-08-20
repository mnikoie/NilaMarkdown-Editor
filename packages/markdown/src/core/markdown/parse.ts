import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import remarkDirective from "remark-directive";
import type { Node as PMNode, Mark } from "prosemirror-model";
import { schema } from "../schema/index.js";

/**
 * Markdown → mdast → سندِ ProseMirror.
 *
 * قاعدهٔ کلیدی: هر گرهی که نشناسیم **حذف نمی‌شود**. یا به گرهِ عمومیِ
 * directive می‌رود یا به `html_block`. سندِ کاربر نباید با نبودنِ یک
 * تعریف ناقص شود.
 */

// mdast تایپِ رسمیِ directive را در `@types/mdast` ندارد (افزونه است)،
// پس حداقلی که لازم داریم را خودمان اعلام می‌کنیم.
interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  [k: string]: unknown;
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkDirective);

export function toMdast(md: string): MdastNode {
  return processor.parse(md) as unknown as MdastNode;
}

/**
 * نشانهٔ واقعیِ تأکید را از متنِ اصلی برمی‌دارد.
 *
 * mdast خودش نمی‌گوید کاربر `**` نوشته یا `__` — فقط می‌گوید «strong».
 * بی این تابع، سریالایزر همه را یک‌دست می‌کند و رفت‌وبرگشت می‌شکند.
 */
function markerAt(source: string, node: MdastNode, fallback: string): string {
  const pos = node.position as { start?: { offset?: number } } | undefined;
  const offset = pos?.start?.offset;
  if (typeof offset !== "number") return fallback;
  const ch = source[offset];
  if (ch === "_" ) return fallback.length === 2 ? "__" : "_";
  if (ch === "*") return fallback.length === 2 ? "**" : "*";
  return fallback;
}

function tickCount(source: string, node: MdastNode): number {
  const pos = node.position as { start?: { offset?: number } } | undefined;
  const offset = pos?.start?.offset;
  if (typeof offset !== "number") return 1;
  let n = 0;
  while (source[offset + n] === "`") n++;
  return n || 1;
}

interface Ctx {
  source: string;
}

function inlineChildren(nodes: MdastNode[] | undefined, marks: readonly Mark[], ctx: Ctx): PMNode[] {
  if (!nodes) return [];
  return nodes.flatMap((n) => inline(n, marks, ctx));
}

function inline(node: MdastNode, marks: readonly Mark[], ctx: Ctx): PMNode[] {
  switch (node.type) {
    case "text":
      return node.value ? [schema.text(node.value, marks as Mark[])] : [];

    case "strong":
      return inlineChildren(node.children, [
        ...marks,
        schema.marks.strong.create({ marker: markerAt(ctx.source, node, "**") }),
      ], ctx);

    case "emphasis":
      return inlineChildren(node.children, [
        ...marks,
        schema.marks.em.create({ marker: markerAt(ctx.source, node, "*") }),
      ], ctx);

    case "delete":
      return inlineChildren(node.children, [...marks, schema.marks.strike.create()], ctx);

    case "inlineCode":
      return [
        schema.text(String(node.value ?? ""), [
          ...marks,
          schema.marks.code.create({ ticks: tickCount(ctx.source, node) }),
        ]),
      ];

    case "link":
      return inlineChildren(node.children, [
        ...marks,
        schema.marks.link.create({ url: node.url, href: node.url, title: node.title ?? null }),
      ], ctx);

    case "image":
      return [
        schema.nodes.image.create({
          src: String(node.url ?? ""),
          alt: node.alt ?? null,
          title: node.title ?? null,
        }),
      ];

    case "break":
      return [schema.nodes.hard_break.create()];

    case "inlineMath":
      return [schema.nodes.math_inline.create({ value: String(node.value ?? "") })];

    case "textDirective":
      return [
        schema.nodes.directive_inline.create(
          { name: String(node.name ?? ""), attributes: node.attributes ?? {} },
          inlineChildren(node.children, marks, ctx),
        ),
      ];

    case "html":
      // HTML درون‌خطی: به‌صورتِ متنِ خام نگه داشته می‌شود تا گم نشود.
      return node.value ? [schema.text(node.value, marks as Mark[])] : [];

    default:
      // ناشناخته — متنش را نگه دار، حذفش نکن.
      if (node.children) return inlineChildren(node.children, marks, ctx);
      return node.value ? [schema.text(String(node.value), marks as Mark[])] : [];
  }
}

function blockChildren(nodes: MdastNode[] | undefined, ctx: Ctx): PMNode[] {
  if (!nodes) return [];
  return nodes.flatMap((n) => block(n, ctx));
}

function block(node: MdastNode, ctx: Ctx): PMNode[] {
  switch (node.type) {
    case "paragraph":
      return [schema.nodes.paragraph.create(null, inlineChildren(node.children, [], ctx))];

    case "heading": {
      // لنگرِ صریحِ `{#id}` را هیچ افزونه‌ای نمی‌فهمد — نه remark-parse نه
      // remark-directive. برای remark فقط متنِ عادی است. پس خودمان از
      // انتهای آخرین گرهِ متنی جدا می‌کنیم و در `attrs.id` می‌گذاریم تا
      // در سریالایز دوباره ساخته شود.
      const { id, children } = extractHeadingId(node.children ?? []);
      return [
        schema.nodes.heading.create(
          { level: node.depth ?? 1, id },
          inlineChildren(children, [], ctx),
        ),
      ];
    }

    case "blockquote":
      return [schema.nodes.blockquote.create(null, blockChildren(node.children, ctx))];

    case "thematicBreak":
      return [schema.nodes.horizontal_rule.create()];

    case "code":
      return [
        schema.nodes.code_block.create(
          { language: node.lang ?? null, meta: node.meta ?? null },
          node.value ? [schema.text(String(node.value))] : [],
        ),
      ];

    case "list": {
      const items = (node.children ?? []).map((li) =>
        schema.nodes.list_item.create(
          {
            checked: (li as MdastNode).checked ?? null,
            // `spread` تعیین می‌کند بینِ بندهای آیتم خطِ خالی بیاید یا نه.
            // اگر نگهش نداریم، `> - یک\n>\n>   > تودرتو` به شکلِ فشرده
            // برمی‌گردد و ساختارِ نقلِ‌قولِ تودرتو عوض می‌شود.
            spread: (li as MdastNode).spread ?? false,
          },
          blockChildren((li as MdastNode).children, ctx),
        ),
      );
      if (node.ordered) {
        return [
          schema.nodes.ordered_list.create(
            { start: (node.start as number) ?? 1, spread: node.spread ?? false },
            items,
          ),
        ];
      }
      const pos = node.position as { start?: { offset?: number } } | undefined;
      const off = pos?.start?.offset;
      const marker = typeof off === "number" ? (ctx.source[off] ?? "-") : "-";
      return [
        schema.nodes.bullet_list.create(
          { marker: "-*+".includes(marker) ? marker : "-", spread: node.spread ?? false },
          items,
        ),
      ];
    }

    case "table": {
      // mdast تراز را به‌ازای هر **ستون** می‌دهد؛ ProseMirror روی هر
      // **سلول** می‌خواهد. اینجا پخش می‌شود.
      const align = (node.align as (string | null)[] | undefined) ?? [];
      const rows = (node.children ?? []).map((row, rowIndex) => {
        const cells = ((row as MdastNode).children ?? []).map((cell, colIndex) => {
          const type = rowIndex === 0 ? schema.nodes.table_header : schema.nodes.table_cell;
          return type.create(
            { align: align[colIndex] ?? null },
            inlineChildren((cell as MdastNode).children, [], ctx),
          );
        });
        return schema.nodes.table_row.create(null, cells);
      });
      return [schema.nodes.table.create(null, rows)];
    }

    case "containerDirective":
      return [
        schema.nodes.directive_block.create(
          {
            name: String(node.name ?? ""),
            attributes: node.attributes ?? {},
            label: directiveLabel(node),
          },
          blockChildren(stripLabel(node).children, ctx),
        ),
      ];

    case "leafDirective":
      return [
        schema.nodes.directive_leaf.create({
          name: String(node.name ?? ""),
          attributes: node.attributes ?? {},
          label: directiveLabel(node),
        }),
      ];

    case "math":
      return [schema.nodes.math_block.create({ value: String(node.value ?? "") })];

    case "yaml":
      return [
        schema.nodes.front_matter.create(
          { value: String(node.value ?? "") },
          node.value ? [schema.text(String(node.value))] : [],
        ),
      ];

    case "html":
      return [schema.nodes.html_block.create({ value: String(node.value ?? "") })];

    default:
      // ناشناخته و بلوکی — به‌صورتِ خام نگه دار.
      if (node.children) return blockChildren(node.children, ctx);
      return node.value
        ? [schema.nodes.html_block.create({ value: String(node.value) })]
        : [];
  }
}

/**
 * `# عنوان {#لنگر}` — لنگر را از انتهای عنوان جدا می‌کند.
 *
 * فقط وقتی جدا می‌شود که در **انتهای آخرین** گرهِ متنی باشد. اگر کاربر
 * `{#x}` را وسطِ جمله نوشته باشد، متنِ عادی است و دست نمی‌خورد.
 */
function extractHeadingId(children: MdastNode[]): {
  id: string | null;
  children: MdastNode[];
} {
  const last = children[children.length - 1];
  if (!last || last.type !== "text" || typeof last.value !== "string") {
    return { id: null, children };
  }

  const m = /^([\s\S]*?)\s*\{#([^}\s]+)\}$/.exec(last.value);
  if (!m) return { id: null, children };

  const rest = m[1]!;
  const trimmed = [...children.slice(0, -1)];
  // اگر بعد از برداشتنِ لنگر چیزی از این گره نماند، خودِ گره حذف می‌شود.
  if (rest.length > 0) trimmed.push({ ...last, value: rest });

  return { id: m[2]!, children: trimmed };
}

/**
 * `:::note[عنوان]` — remark-directive عنوان را به‌صورتِ اولین فرزند با
 * `data.directiveLabel` می‌گذارد، نه یک فیلدِ جدا.
 */
function directiveLabel(node: MdastNode): string | null {
  const first = node.children?.[0] as MdastNode | undefined;
  if (first && (first.data as { directiveLabel?: boolean })?.directiveLabel) {
    return textOf(first);
  }
  return null;
}

function stripLabel(node: MdastNode): MdastNode {
  const first = node.children?.[0] as MdastNode | undefined;
  if (first && (first.data as { directiveLabel?: boolean })?.directiveLabel) {
    return { ...node, children: node.children!.slice(1) };
  }
  return node;
}

function textOf(node: MdastNode): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(textOf).join("");
}

/** ورودیِ اصلی: مارک‌داون → سندِ ProseMirror. */
export function parse(md: string): PMNode {
  const tree = toMdast(md);
  const ctx: Ctx = { source: md };
  const content = blockChildren(tree.children, ctx);
  // سندِ خالی هم باید معتبر باشد — `block+` حداقل یک گره می‌خواهد.
  if (content.length === 0) content.push(schema.nodes.paragraph.create());
  return schema.nodes.doc.create(null, content);
}
