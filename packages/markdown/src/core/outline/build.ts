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

/** عنوانِ گرهِ فهرست: متنِ اولین آیتم، کوتاه‌شده — فهرست خودش عنوان ندارد. */
function listTitle(node: PMNode): string {
  const first = node.firstChild ? textOfNode(node.firstChild) : "";
  const trimmed = first.length > 40 ? `${first.slice(0, 40)}…` : first;
  return trimmed || "فهرست";
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

  // اگر سند با یک H1 بی‌لنگر شروع شود و بعد H1 دیگری داشته باشد، اولی
  // عنوانِ خودِ سند است، نه فصلِ هم‌سطح. این الگوی فایل‌های واقعیِ واردشده
  // است: «عنوان بخشنامه» سپس «فصل اول {#...}». بدون این قاعده، بستنِ عنوان
  // فقط مقدمه را پنهان می‌کرد و نه کل سند را.
  const first = doc.firstChild;
  let h1Count = 0;
  let anchoredH1Count = 0;
  let chapterH1AfterTitle = false;
  const looksLikeChapter = (title: string) => /^(?:فصل(?:\s|:)|chapter(?:\s|:))/iu.test(title.trim());
  doc.descendants((node) => {
    if (node.type.name === "heading" && node.attrs.level === 1) {
      h1Count++;
      if (node.attrs.id) anchoredH1Count++;
      if (node !== first && looksLikeChapter(textOfNode(node))) chapterH1AfterTitle = true;
    }
    return true;
  });
  const hasDocumentTitle =
    first?.type.name === "heading" &&
    first.attrs.level === 1 &&
    !first.attrs.id &&
    h1Count > 1 &&
    (anchoredH1Count > 0 || (!looksLikeChapter(textOfNode(first)) && chapterH1AfterTitle));

  doc.descendants((node, pos) => {
    let entry: OutlineNode | null = null;

    if (node.type.name === "heading") {
      const title = textOfNode(node);
      const explicit = node.attrs.id as string | null;
      entry = {
        id: makeUnique(explicit || slug(title, index), seen),
        kind: "heading",
        level: hasDocumentTitle && pos === 0 ? 0 : headingRank(node.attrs.level as number),
        title,
        from: pos,
        to: pos + node.nodeSize,
        foldable: false,
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
          foldable: false,
          children: [],
        };
      }
    } else if (node.type.name === "bullet_list" || node.type.name === "ordered_list") {
      // ★ فقط فهرستِ سطحِ بالا — یعنی زیرِ یک heading/directive، نه
      //   زیرِ یک list_item دیگر. هر <li> گرهِ خودش نمی‌شود؛ کاربر
      //   صریحاً ردِ این را داد چون روی سندِ صدها آیتمی پنل شلوغ
      //   می‌شد. با return false زیرِ همین بلوک، هیچ فهرستِ تودرتویی
      //   بازدید نمی‌شود — یک گره برای کلِ فهرست، نه یکی به‌ازای هر عمق.
      const parentNode = doc.resolve(pos).parent;
      if (parentNode.type.name !== "list_item") {
        entry = {
          id: makeUnique(slug(listTitle(node), index), seen),
          kind: node.type.name,
          level: RANK.بند,
          title: listTitle(node),
          from: pos,
          to: pos + node.nodeSize,
          foldable: false,
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
    // فهرست تودرتو ندارد — بازدید از فرزندانش (list_item ها و
    // فهرست‌های عمیق‌تر) عمداً متوقف می‌شود.
    if (entry.kind === "bullet_list" || entry.kind === "ordered_list") return false;
    return true;
  });

  // «فرزندِ ساختاری ندارد» به معنیِ «قابل‌تاشدن نیست» نیست. یک H2 که
  // چند پاراگراف دارد نیز از Outline باید باز و بسته شود. این مقدار را از
  // بازهٔ واقعیِ هر بخش می‌گیریم تا پنل و مثلثِ داخلِ متن یک رفتار داشته
  // باشند.
  const flat = flattenOutline(roots);
  for (let i = 0; i < flat.length; i++) {
    const node = flat[i]!;
    const resolved = doc.nodeAt(node.from);
    if (!resolved) continue;
    if (node.kind !== "heading") {
      node.foldable = resolved.childCount > 0;
      continue;
    }
    let end = doc.content.size;
    for (let j = i + 1; j < flat.length; j++) {
      if (flat[j]!.level <= node.level) {
        end = flat[j]!.from;
        break;
      }
    }
    node.foldable = end > node.from + resolved.nodeSize;
  }

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
