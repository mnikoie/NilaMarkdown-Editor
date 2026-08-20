import type { Node as PMNode } from "prosemirror-model";
import type { OutlineNode, OutlineOptions } from "./types.js";
import type { MarkRegistry } from "../directives/types.js";
import { BUILTIN_MARKS, RANK } from "../directives/builtin.js";
import { slugify, makeUnique } from "./slug.js";

/**
 * ساختِ درختِ ساختار از سند.
 *
 * موتور همان «پشتهٔ مبتنی‌بر‌رتبه»ی `structure_tree.py` است: هر گرهِ
 * عمیق‌تر زیرِ نزدیک‌ترین گرهِ کم‌عمق‌ترِ باز می‌نشیند. کاملاً قاعده‌مند —
 * هیچ حدسی زده نمی‌شود.
 *
 * ★ برخلافِ پروتوتایپِ پایتون، اینجا هیچ regexی روی متن اجرا نمی‌شود.
 * تشخیصِ «این خط یک ماده است» کارِ پایپ‌لاینِ ورود است، نه ادیتور. ادیتور
 * فقط چیزی را می‌خواند که صریح در سند نوشته شده. اگر ادیتور حدس بزند،
 * کاربر وسطِ جمله کلمهٔ «ماده» را تایپ می‌کند و درخت می‌پرد.
 */

/**
 * رتبهٔ سرفصلِ مارک‌داون.
 *
 * `#` تا `######` باید بالاتر (بیرونی‌تر) از گره‌های ساختاری باشند، چون
 * فصل و باب با `#` نوشته می‌شوند و ماده و تبصره داخلشان می‌نشینند.
 * `RANK.سند` صفر است، پس سرفصل‌ها از ۱ شروع می‌شوند و `ماده` روی ۶ می‌ماند.
 */
function headingRank(level: number): number {
  return level; // h1 → ۱ … h6 → ۶
}

function directiveRank(name: string, registry: MarkRegistry): number | null {
  const def = registry[name];
  if (!def) return null;
  // مارکی که `anchor` نیست در درخت نمی‌آید — «نکته» گرهِ ساختار نیست.
  if (!def.anchor) return null;
  return def.rank ?? RANK.بند;
}

function textOfNode(node: PMNode): string {
  return node.textBetween(0, node.content.size, " ", " ").trim();
}

/** عنوانِ گرهِ directive: از `[…]`، وگرنه از برچسبِ تعریف، وگرنه نامش. */
function directiveTitle(node: PMNode, registry: MarkRegistry): string {
  const label = node.attrs.label as string | null;
  const attrs = (node.attrs.attributes ?? {}) as Record<string, string>;
  const def = registry[node.attrs.name as string];
  const base = def?.label ?? (node.attrs.name as string);
  const num = attrs["شماره"];

  if (label) return num ? `${base} ${num}: ${label}` : `${base}: ${label}`;
  if (num) return `${base} ${num}`;
  return base;
}

export function buildOutline(
  doc: PMNode,
  registry: MarkRegistry = BUILTIN_MARKS,
  options: OutlineOptions = {},
): OutlineNode[] {
  const slug = options.slugify ?? slugify;
  const seen = new Map<string, number>();
  const roots: OutlineNode[] = [];
  /** پشته — همیشه از بیرونی به درونی مرتب است. */
  const stack: OutlineNode[] = [];
  let index = 0;

  doc.descendants((node, pos) => {
    let entry: OutlineNode | null = null;

    if (node.type.name === "heading") {
      const title = textOfNode(node);
      const explicit = node.attrs.id as string | null;
      entry = {
        id: makeUnique(explicit || slug(title, index), seen),
        kind: "heading",
        level: headingRank(node.attrs.level as number),
        title,
        from: pos,
        to: pos + node.nodeSize,
        children: [],
      };
    } else if (node.type.name === "directive_block") {
      const name = node.attrs.name as string;
      const rank = directiveRank(name, registry);
      if (rank !== null) {
        const attrs = (node.attrs.attributes ?? {}) as Record<string, string>;
        const title = directiveTitle(node, registry);
        entry = {
          id: makeUnique(attrs["#"] || slug(title, index), seen),
          kind: name,
          level: rank,
          title,
          number: attrs["شماره"],
          status: attrs["وضعیت"],
          from: pos,
          to: pos + node.nodeSize,
          children: [],
        };
      }
    }

    if (!entry) return true;
    index++;

    // پشته را تا جایی خالی کن که والدِ واقعی بالا بیاید.
    while (stack.length > 0 && stack[stack.length - 1]!.level >= entry.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(entry);
    else roots.push(entry);

    stack.push(entry);
    return true;
  });

  return roots;
}

/** درخت را تخت می‌کند — برای پیمایشِ کیبوردی و جست‌وجو. */
export function flattenOutline(nodes: OutlineNode[]): OutlineNode[] {
  const out: OutlineNode[] = [];
  const walk = (list: OutlineNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** گرهی که موقعیتِ داده‌شده داخلش است — برای «کجای سندم؟» در پنل. */
export function nodeAt(nodes: OutlineNode[], pos: number): OutlineNode | null {
  let found: OutlineNode | null = null;
  for (const n of flattenOutline(nodes)) {
    if (pos >= n.from && pos < n.to) {
      // عمیق‌ترین گرهِ دربرگیرنده برنده است.
      if (!found || n.level > found.level) found = n;
    }
  }
  return found;
}
