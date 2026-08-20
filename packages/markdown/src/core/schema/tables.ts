import type { NodeSpec } from "prosemirror-model";

/**
 * جدول — سازگار با `prosemirror-tables`.
 *
 * ★ `align` روی سلول نگه داشته می‌شود، نه فقط روی ستون. mdast تراز را در
 * `table.align` (آرایه‌ای به ازای هر ستون) می‌گذارد؛ ما هنگامِ خواندن
 * پخشش می‌کنیم روی سلول‌ها و هنگامِ نوشتن از ردیفِ اول بازسازی‌اش
 * می‌کنیم. بی این، تراز در رفت‌وبرگشت گم می‌شود.
 *
 * `colspan`/`rowspan` در مارک‌داونِ GFM وجود ندارند، ولی schema باید
 * داشته باشدشان چون `prosemirror-tables` رویشان حساب می‌کند. اگر کاربر
 * سلولی را ادغام کند، هنگامِ سریالایز به جدولِ ساده تبدیل می‌شود —
 * محدودیتِ خودِ قالب است، نه ما.
 */

const cellAttrs = {
  colspan: { default: 1 },
  rowspan: { default: 1 },
  colwidth: { default: null },
  /** `left` | `center` | `right` | `null` */
  align: { default: null },
};

function cellDOM(tag: string) {
  return (node: { attrs: Record<string, unknown> }) => {
    const attrs: Record<string, string> = {};
    if ((node.attrs.colspan as number) !== 1) attrs.colspan = String(node.attrs.colspan);
    if ((node.attrs.rowspan as number) !== 1) attrs.rowspan = String(node.attrs.rowspan);
    if (node.attrs.align) attrs.style = `text-align: ${node.attrs.align as string}`;
    return [tag, attrs, 0] as const;
  };
}

const table: NodeSpec = {
  content: "table_row+",
  tableRole: "table",
  isolating: true,
  group: "block",
  parseDOM: [{ tag: "table" }],
  toDOM: () => ["table", ["tbody", 0]],
};

const table_row: NodeSpec = {
  content: "(table_cell | table_header)*",
  tableRole: "row",
  parseDOM: [{ tag: "tr" }],
  toDOM: () => ["tr", 0],
};

const table_cell: NodeSpec = {
  content: "inline*",
  attrs: cellAttrs,
  tableRole: "cell",
  isolating: true,
  parseDOM: [{ tag: "td" }],
  toDOM: cellDOM("td"),
};

const table_header: NodeSpec = {
  content: "inline*",
  attrs: cellAttrs,
  tableRole: "header_cell",
  isolating: true,
  parseDOM: [{ tag: "th" }],
  toDOM: cellDOM("th"),
};

export const tableNodes = { table, table_row, table_cell, table_header };
