import type { MarkSpec } from "prosemirror-model";

/**
 * نشانه‌های درون‌خطی.
 *
 * `marker` روی `strong` و `em` نگه داشته می‌شود چون مارک‌داون برای هرکدام دو
 * نوشتنِ معادل دارد (`**` و `__`، `*` و `_`). اگر نگه نداریم، سریالایزر
 * انتخابِ خودش را تحمیل می‌کند و کاربر در diff تغییری می‌بیند که نداده.
 */

const strong: MarkSpec = {
  attrs: { marker: { default: "**" } },
  parseDOM: [{ tag: "strong" }, { tag: "b" }],
  toDOM: () => ["strong", 0],
};

const em: MarkSpec = {
  attrs: { marker: { default: "*" } },
  parseDOM: [{ tag: "em" }, { tag: "i" }],
  toDOM: () => ["em", 0],
};

const strike: MarkSpec = {
  parseDOM: [{ tag: "s" }, { tag: "del" }],
  toDOM: () => ["s", 0],
};

const code: MarkSpec = {
  /** تعدادِ بک‌تیک — `` `a` `` و ``` ``a`b`` ``` فرق دارند. */
  attrs: { ticks: { default: 1 } },
  excludes: "_",
  code: true,
  parseDOM: [{ tag: "code" }],
  toDOM: () => ["code", 0],
};

const link: MarkSpec = {
  attrs: { href: {}, title: { default: null } },
  inclusive: false,
  parseDOM: [
    {
      tag: "a[href]",
      getAttrs: (dom) => ({
        href: (dom as HTMLElement).getAttribute("href"),
        title: (dom as HTMLElement).getAttribute("title"),
      }),
    },
  ],
  toDOM: (m) => ["a", { href: m.attrs.href as string, title: m.attrs.title as string }, 0],
};

export const marks = { strong, em, strike, code, link };
