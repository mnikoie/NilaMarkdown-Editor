import type { NodeSpec } from "prosemirror-model";
import { tableNodes } from "./tables.js";
import { isSafeImageSrc } from "../security.js";

/**
 * گره‌های سند.
 *
 * قاعدهٔ حاکم بر این فایل: هر چیزی که در مارک‌داونِ ورودی هست باید در یک
 * `attrs` جایی داشته باشد، حتی اگر ادیتور بلد نباشد نمایشش دهد. چیزی که
 * در سند جا نداشته باشد، هنگامِ سریالایز گم می‌شود و `serialize(parse(md))
 * === md` می‌شکند.
 */

const doc: NodeSpec = { content: "front_matter? block+" };

const paragraph: NodeSpec = {
  content: "inline*",
  group: "block",
  attrs: { dir: { default: null } },
  parseDOM: [{ tag: "p" }],
  toDOM: (n) => ["p", n.attrs.dir ? { dir: n.attrs.dir as string } : {}, 0],
};

const text: NodeSpec = { group: "inline" };

const heading: NodeSpec = {
  attrs: {
    level: { default: 1 },
    /** لنگرِ صریح از `{#fasl-4}` — اگر کاربر ننوشته، `null` می‌ماند و
     *  هنگامِ سریالایز هم نوشته نمی‌شود. لنگرِ خودکار فقط در حافظه ساخته
     *  می‌شود، نه در متن. */
    id: { default: null },
    dir: { default: null },
  },
  content: "inline*",
  group: "block",
  defining: true,
  parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
  toDOM: (n) => [
    `h${n.attrs.level as number}`,
    {
      ...(n.attrs.id ? { id: n.attrs.id as string } : {}),
      ...(n.attrs.dir ? { dir: n.attrs.dir as string } : {}),
    },
    0,
  ],
};

/**
 * گرهِ عمومیِ directive — بلوکی.
 *
 * ★ چرا `attrs` یک شیءِ کامل است و نه فیلدهای جدا: مارکی که ادیتور
 * نمی‌شناسد هم باید صفاتش را سالم نگه دارد و بی‌کم‌وکاست پس بدهد. اگر
 * فقط صفاتِ شناخته‌شده را ذخیره کنیم، سندِ کاربر با نصب‌نبودنِ یک تعریف
 * ناقص می‌شود — همان چیزی که بندِ ۱۸ منع کرده.
 */
const directive_block: NodeSpec = {
  attrs: {
    name: { default: "" },
    attributes: { default: {} },
    /** `directive` یا Alert سازگار با Typora/GitHub. */
    syntax: { default: "directive" },
    /** محتوای `[…]` در `:::note[عنوان]` */
    label: { default: null },
  },
  content: "block+",
  group: "block",
  defining: true,
  isolating: true,
  toDOM: (n) => [
    "div",
    { "data-directive": n.attrs.name as string, class: "tm-directive" },
    0,
  ],
};

/** `::name{…}` — یک خط، بی محتوا. */
const directive_leaf: NodeSpec = {
  attrs: {
    name: { default: "" },
    attributes: { default: {} },
    label: { default: null },
  },
  group: "block",
  atom: true,
  toDOM: (n) => [
    "div",
    { "data-directive-leaf": n.attrs.name as string, class: "tm-directive-leaf" },
  ],
};

/** `:name[متن]{…}` — درون‌خطی. محتوا دارد، پس atom نیست. */
const directive_inline: NodeSpec = {
  attrs: {
    name: { default: "" },
    attributes: { default: {} },
  },
  content: "inline*",
  group: "inline",
  inline: true,
  toDOM: (n) => [
    "span",
    { "data-directive-inline": n.attrs.name as string, class: "tm-directive-inline" },
    0,
  ],
};

const blockquote: NodeSpec = {
  content: "block+",
  group: "block",
  defining: true,
  parseDOM: [{ tag: "blockquote" }],
  toDOM: () => ["blockquote", 0],
};

const horizontal_rule: NodeSpec = {
  group: "block",
  parseDOM: [{ tag: "hr" }],
  toDOM: () => ["hr"],
};

/** `[شناسه]: https://example.com "عنوان"` */
const link_definition: NodeSpec = {
  attrs: {
    identifier: { default: "link" },
    url: { default: "" },
    title: { default: null },
  },
  group: "block",
  atom: true,
  defining: true,
  toDOM: (n) => [
    "div",
    {
      class: "tm-link-definition",
      "data-identifier": n.attrs.identifier as string,
      contenteditable: "false",
    },
    `[${n.attrs.identifier as string}]: ${n.attrs.url as string}`,
  ],
};

/** `[TOC]` — فهرست مطالبی که از سرفصل‌های همان سند ساخته می‌شود. */
const table_of_contents: NodeSpec = {
  group: "block",
  atom: true,
  defining: true,
  toDOM: () => ["nav", { class: "tm-toc", contenteditable: "false" }, "فهرست مطالب"],
};

const code_block: NodeSpec = {
  attrs: { language: { default: null }, meta: { default: null } },
  content: "text*",
  marks: "",
  group: "block",
  code: true,
  defining: true,
  parseDOM: [{ tag: "pre", preserveWhitespace: "full" }],
  toDOM: (n) => [
    "pre",
    { "data-language": (n.attrs.language as string) ?? "" },
    ["code", 0],
  ],
};

const bullet_list: NodeSpec = {
  content: "list_item+",
  group: "block",
  /** `-` یا `*` یا `+` — کدام نشانه استفاده شده. بی این، سریالایزر همه را
   *  یک‌دست می‌کند و diffِ کاربر پر می‌شود از تغییری که او نداده. */
  attrs: { marker: { default: "-" }, spread: { default: false } },
  parseDOM: [{ tag: "ul" }],
  toDOM: () => ["ul", 0],
};

const ordered_list: NodeSpec = {
  content: "list_item+",
  group: "block",
  attrs: { start: { default: 1 }, spread: { default: false } },
  parseDOM: [{ tag: "ol" }],
  toDOM: (n) => ["ol", { start: n.attrs.start as number }, 0],
};

const list_item: NodeSpec = {
  content: "block+",
  attrs: { checked: { default: null }, spread: { default: false } },
  defining: true,
  parseDOM: [{ tag: "li" }],
  toDOM: (n) => [
    "li",
    n.attrs.checked !== null ? { "data-checked": String(n.attrs.checked) } : {},
    0,
  ],
};

const image: NodeSpec = {
  inline: true,
  group: "inline",
  draggable: true,
  attrs: { src: {}, alt: { default: null }, title: { default: null } },
  parseDOM: [
    {
      tag: "img[src]",
      getAttrs: (dom) => ({
        src: (dom as HTMLElement).getAttribute("src"),
        alt: (dom as HTMLElement).getAttribute("alt"),
        title: (dom as HTMLElement).getAttribute("title"),
      }),
    },
  ],
  // تصویرِ با `src`ِ ناامن رندر نمی‌شود، ولی گره در سند می‌ماند تا
  // رفت‌وبرگشت نشکند.
  toDOM: (n) => [
    "img",
    isSafeImageSrc((n.attrs.src as string) ?? "")
      ? n.attrs
      : { ...n.attrs, src: "", "data-blocked": "true" },
  ],
};

const hard_break: NodeSpec = {
  inline: true,
  group: "inline",
  selectable: false,
  parseDOM: [{ tag: "br" }],
  toDOM: () => ["br"],
};

/** HTML خام — دست‌نخورده نگه داشته می‌شود. رندرش تصمیمِ لایهٔ بالاتر است. */
const html_block: NodeSpec = {
  attrs: { value: { default: "" } },
  group: "block",
  atom: true,
  code: true,
  toDOM: (n) => ["div", { class: "tm-html", "data-html": n.attrs.value as string }],
};

const front_matter: NodeSpec = {
  attrs: { value: { default: "" } },
  content: "text*",
  marks: "",
  code: true,
  defining: true,
  isolating: true,
  toDOM: () => ["div", { class: "tm-front-matter" }, 0],
};

const math_block: NodeSpec = {
  attrs: { value: { default: "" } },
  group: "block",
  atom: true,
  toDOM: () => ["div", { class: "tm-math-block" }],
};

/**
 * ارجاعِ فوت‌نوت — `[^۱]` در متن.
 *
 * `atom` است چون محتوایش در تعریف است نه اینجا. `identifier` هرچه
 * باشد نگه داشته می‌شود، حتی فارسی — تست شد که `[^۱]` درست parse
 * می‌شود.
 */
const footnote_reference: NodeSpec = {
  attrs: { identifier: { default: "" }, label: { default: null } },
  inline: true,
  group: "inline",
  atom: true,
  toDOM: (n) => [
    "sup",
    {
      class: "tm-footnote-ref",
      "data-identifier": n.attrs.identifier as string,
    },
    `[${(n.attrs.label as string) ?? (n.attrs.identifier as string)}]`,
  ],
};

/** تعریفِ فوت‌نوت — `[^۱]: توضیح` که معمولاً ته سند می‌آید. */
const footnote_definition: NodeSpec = {
  attrs: { identifier: { default: "" }, label: { default: null } },
  content: "block+",
  group: "block",
  defining: true,
  isolating: true,
  toDOM: (n) => [
    "div",
    {
      class: "tm-footnote-def",
      "data-identifier": n.attrs.identifier as string,
    },
    0,
  ],
};

const math_inline: NodeSpec = {
  attrs: { value: { default: "" } },
  inline: true,
  group: "inline",
  atom: true,
  toDOM: () => ["span", { class: "tm-math-inline" }],
};

export const nodes = {
  doc,
  ...tableNodes,
  front_matter,
  paragraph,
  heading,
  directive_block,
  directive_leaf,
  directive_inline,
  blockquote,
  horizontal_rule,
  link_definition,
  table_of_contents,
  code_block,
  bullet_list,
  ordered_list,
  list_item,
  image,
  hard_break,
  html_block,
  math_block,
  math_inline,
  footnote_reference,
  footnote_definition,
  text,
};
