import type { Node as PMNode, Mark } from "prosemirror-model";
import { decodeNamedCharacterReference } from "decode-named-character-reference";
import { schema } from "../schema/index.js";
import { parseMarkdownAst, type MarkdownAstNode } from "./ast.js";

/**
 * Markdown → mdast → سندِ ProseMirror.
 *
 * قاعدهٔ کلیدی: هر گرهی که نشناسیم **حذف نمی‌شود**. یا به گرهِ عمومیِ
 * directive می‌رود یا به `html_block`. سندِ کاربر نباید با نبودنِ یک
 * تعریف ناقص شود.
 */

// mdast تایپِ رسمیِ directive را در `@types/mdast` ندارد (افزونه است)،
// پس حداقلی که لازم داریم را خودمان اعلام می‌کنیم.
type MdastNode = MarkdownAstNode;

export function toMdast(md: string): MdastNode {
  return parseMarkdownAst(md);
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
  definitions: Map<string, { url: string; title: string | null }>;
  linkify: boolean;
}

export interface ParseOptions {
  /** تبدیل خودکار نشانی‌های ساده به لینک. پیش‌فرض روشن است. */
  linkify?: boolean;
}

function inlineChildren(nodes: MdastNode[] | undefined, marks: readonly Mark[], ctx: Ctx): PMNode[] {
  if (!nodes) return [];
  const out: PMNode[] = [];
  let active = [...marks];

  for (const node of nodes) {
    if (node.type === "html") {
      const html = String(node.value ?? "");
      if (/^<u(?:\s[^>]*)?>$/i.test(html)) {
        if (!schema.marks.underline.isInSet(active)) active.push(schema.marks.underline.create());
        continue;
      }
      if (/^<\/u\s*>$/i.test(html)) {
        active = active.filter((mark) => mark.type !== schema.marks.underline);
        continue;
      }
      const comment = /^<!--[\s\S]*-->$/.test(html) ? html.slice(4, -3) : null;
      if (comment !== null) {
        if (comment) out.push(schema.text(comment, [...active, schema.marks.comment.create()]));
        continue;
      }
    }
    out.push(...inline(node, active, ctx));
  }

  return out;
}

function inline(node: MdastNode, marks: readonly Mark[], ctx: Ctx): PMNode[] {
  switch (node.type) {
    case "text":
      return textWithEntities(node, marks, ctx);

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

    case "link": {
      const linkSource = sourceSlice(ctx.source, node).trim();
      const explicit = /^[<[]/.test(linkSource);
      return inlineChildren(node.children, [
        ...marks,
        schema.marks.link.create({
          url: node.url,
          href: node.url,
          title: node.title ?? null,
          autolinkLiteral: !explicit,
          autolinkSource: explicit ? null : linkSource,
          inactive: !explicit && !ctx.linkify,
        }),
      ], ctx);
    }

    case "linkReference": {
      const identifier = String(node.identifier ?? node.label ?? "");
      const definition = ctx.definitions.get(identifier.toLowerCase());
      return inlineChildren(node.children, [
        ...marks,
        schema.marks.link.create({
          href: definition?.url ?? `#${identifier}`,
          title: definition?.title ?? null,
          identifier,
          referenceType: node.referenceType ?? "full",
        }),
      ], ctx);
    }

    case "image":
      return [
        schema.nodes.image.create({
          src: String(node.url ?? ""),
          alt: node.alt ?? null,
          title: node.title ?? null,
        }),
      ];

    case "break":
      return [schema.nodes.hard_break.create({ marker: breakMarker(ctx.source, node) })];

    case "inlineMath":
      return [schema.nodes.math_inline.create({ value: String(node.value ?? "") })];

    case "textDirective":
      return [
        schema.nodes.directive_inline.create(
          { name: String(node.name ?? ""), attributes: node.attributes ?? {} },
          inlineChildren(node.children, marks, ctx),
        ),
      ];

    case "footnoteReference":
      return [
        schema.nodes.footnote_reference.create({
          identifier: String(node.identifier ?? ""),
          label: node.label ?? null,
        }),
      ];

    case "html":
      return node.value
        ? [schema.nodes.html_inline.create({ value: String(node.value) })]
        : [];

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
      if (
        node.children?.length === 1 &&
        node.children[0]?.type === "text" &&
        /^\[toc\]$/i.test(String(node.children[0].value ?? "").trim())
      ) {
        return [schema.nodes.table_of_contents.create()];
      }
      return [schema.nodes.paragraph.create(null, inlineChildren(node.children, [], ctx))];

    case "heading": {
      // لنگرِ صریحِ `{#id}` را هیچ افزونه‌ای نمی‌فهمد — نه remark-parse نه
      // remark-directive. برای remark فقط متنِ عادی است. پس خودمان از
      // انتهای آخرین گرهِ متنی جدا می‌کنیم و در `attrs.id` می‌گذاریم تا
      // در سریالایز دوباره ساخته شود.
      const { id, children } = extractHeadingId(node.children ?? []);
      const headingSource = sourceHeadingStyle(ctx.source, node);
      return [
        schema.nodes.heading.create(
          { level: node.depth ?? 1, id, ...headingSource },
          inlineChildren(children, [], ctx),
        ),
      ];
    }

    case "blockquote": {
      const alert = alertFromBlockquote(node, ctx);
      if (alert) {
        return [
          schema.nodes.directive_block.create(
            { name: alert.type, attributes: {}, label: null, syntax: "alert" },
            blockChildren(alert.children, ctx),
          ),
        ];
      }
      return [schema.nodes.blockquote.create(null, blockChildren(node.children, ctx))];
    }

    case "thematicBreak":
      return [schema.nodes.horizontal_rule.create()];

    case "code": {
      const fence = sourceFence(ctx.source, node);
      return [
        schema.nodes.code_block.create(
          { language: node.lang ?? null, meta: node.meta ?? null, ...fence },
          node.value ? [schema.text(String(node.value))] : [],
        ),
      ];
    }

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
        const delimiter = /^\s*\d+([.)])/.exec(sourceSlice(ctx.source, node))?.[1] ?? ".";
        return [
          schema.nodes.ordered_list.create(
            { start: (node.start as number) ?? 1, spread: node.spread ?? false, delimiter },
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
            syntax: "directive",
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

    case "footnoteDefinition":
      return [
        schema.nodes.footnote_definition.create(
          {
            identifier: String(node.identifier ?? ""),
            label: node.label ?? null,
          },
          blockChildren(node.children, ctx),
        ),
      ];

    case "definition":
      return [
        schema.nodes.link_definition.create({
          identifier: String(node.identifier ?? node.label ?? "link"),
          url: String(node.url ?? ""),
          title: node.title ?? null,
        }),
      ];

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

const ENTITY_PATTERN = /&(?:#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]+);/g;

function decodeEntity(source: string): string | null {
  if (/^&#[xX]/.test(source)) {
    const value = Number.parseInt(source.slice(3, -1), 16);
    return numericEntity(value);
  }
  if (/^&#/.test(source)) {
    const value = Number.parseInt(source.slice(2, -1), 10);
    return numericEntity(value);
  }
  return decodeNamedCharacterReference(source.slice(1, -1)) || null;
}

function numericEntity(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  if (value === 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return "\uFFFD";
  return String.fromCodePoint(value);
}

function textWithEntities(node: MdastNode, marks: readonly Mark[], ctx: Ctx): PMNode[] {
  const value = String(node.value ?? "");
  if (!value) return [];
  const source = sourceSlice(ctx.source, node);
  const matches = [...source.matchAll(ENTITY_PATTERN)];
  if (!matches.length) return [schema.text(value, marks as Mark[])];

  let rebuilt = "";
  let sourceCursor = 0;
  for (const match of matches) {
    rebuilt += source.slice(sourceCursor, match.index);
    const decoded = decodeEntity(match[0]);
    if (decoded == null) return [schema.text(value, marks as Mark[])];
    rebuilt += decoded;
    sourceCursor = (match.index ?? 0) + match[0].length;
  }
  rebuilt += source.slice(sourceCursor);
  if (rebuilt !== value) return [schema.text(value, marks as Mark[])];

  const entries: { offset: number; decoded: string; source: string }[] = [];
  sourceCursor = 0;
  let valueCursor = 0;
  for (const match of matches) {
    const start = match.index ?? 0;
    valueCursor += start - sourceCursor;
    const decoded = decodeEntity(match[0])!;
    entries.push({ offset: valueCursor, decoded, source: match[0] });
    valueCursor += decoded.length;
    sourceCursor = start + match[0].length;
  }
  return [schema.text(value, [...marks, schema.marks.entity.create({ entries })])];
}

const ALERT_TYPES = new Set(["note", "tip", "important", "warning", "caution"]);

/** `> [!NOTE]` را به همان گرهٔ عمومیِ کارت‌های بلوکی تبدیل می‌کند. */
function alertFromBlockquote(node: MdastNode, ctx: Ctx): { type: string; children: MdastNode[] } | null {
  const position = node.position as { start?: { offset?: number }; end?: { offset?: number } } | undefined;
  const start = position?.start?.offset;
  const end = position?.end?.offset;
  if (typeof start !== "number" || typeof end !== "number") return null;
  const firstLine = ctx.source.slice(start, end).split(/\r?\n/, 1)[0] ?? "";
  if (!/^\s*>\s*\[!/i.test(firstLine)) return null;

  const children = [...(node.children ?? [])];
  const first = children[0];
  const firstInline = first?.type === "paragraph" ? first.children?.[0] : undefined;
  if (!first || !firstInline || firstInline.type !== "text") return null;

  const match = /^\[!([a-z]+)\](?:\s+([\s\S]*))?$/i.exec(String(firstInline.value ?? ""));
  const type = match?.[1]?.toLowerCase();
  if (!type || !ALERT_TYPES.has(type)) return null;

  const rest = match?.[2] ?? "";
  if (rest) {
    firstInline.value = rest;
  } else {
    children.shift();
  }
  if (children.length === 0) children.push({ type: "paragraph", children: [] });
  return { type, children };
}

/** ورودیِ اصلی: مارک‌داون → سندِ ProseMirror. */
export function parse(md: string, options: ParseOptions = {}): PMNode {
  const tree = toMdast(md);
  const definitions = new Map<string, { url: string; title: string | null }>();
  for (const child of tree.children ?? []) {
    if (child.type !== "definition") continue;
    const identifier = String(child.identifier ?? child.label ?? "").toLowerCase();
    definitions.set(identifier, {
      url: String(child.url ?? ""),
      title: child.title ? String(child.title) : null,
    });
  }
  const ctx: Ctx = { source: md, definitions, linkify: options.linkify !== false };
  const content = blockChildren(tree.children, ctx);
  // سندِ خالی هم باید معتبر باشد — `block+` حداقل یک گره می‌خواهد.
  if (content.length === 0) content.push(schema.nodes.paragraph.create());
  return schema.nodes.doc.create({ lineEnding: md.includes("\r\n") ? "\r\n" : "\n" }, content);
}

function sourceSlice(source: string, node: MdastNode): string {
  const position = node.position as { start?: { offset?: number }; end?: { offset?: number } } | undefined;
  const start = position?.start?.offset;
  const end = position?.end?.offset;
  return typeof start === "number" && typeof end === "number" ? source.slice(start, end) : "";
}

function sourceHeadingStyle(source: string, node: MdastNode): { syntax: "atx" | "setext"; setextMarker: string | null } {
  const lines = sourceSlice(source, node).split(/\r?\n/);
  const marker = lines.at(-1)?.trim() ?? "";
  return /^(?:=+|-+)$/.test(marker)
    ? { syntax: "setext", setextMarker: marker }
    : { syntax: "atx", setextMarker: null };
}

function sourceFence(source: string, node: MdastNode): { fence: string | null; fenceLength: number } {
  const first = sourceSlice(source, node).split(/\r?\n/, 1)[0] ?? "";
  const match = /^\s*(`{3,}|~{3,})/.exec(first);
  return match
    ? { fence: match[1]![0]!, fenceLength: match[1]!.length }
    : { fence: null, fenceLength: 3 };
}

function breakMarker(source: string, node: MdastNode): "spaces" | "backslash" {
  return sourceSlice(source, node).startsWith("\\") ? "backslash" : "spaces";
}
