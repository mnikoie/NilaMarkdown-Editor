/**
 * ورودیِ نمایشگر — عمداً جدا.
 *
 * کسی که فقط نمایش می‌خواهد نباید یک بایت از ProseMirror دانلود کند. این
 * فایل هیچ چیزی از `core/plugins` یا `core/schema` وارد نمی‌کند.
 *
 * بودجه: زیر ۴۰ کیلوبایتِ gzip (بندِ ۱ پرامپت).
 */

export { buildOutline, flattenOutline, nodeAt } from "./core/outline/build.js";
export { slugify, makeUnique } from "./core/outline/slug.js";
export type { OutlineNode, OutlineOptions } from "./core/outline/types.js";

export { BUILTIN_MARKS, RANK } from "./core/directives/builtin.js";
export type {
  MarkDefinition,
  MarkRegistry,
  DirectiveKind,
  AttrSpec,
  AttrType,
  MarkVariant,
} from "./core/directives/types.js";

export { OutlineTree } from "./react/Outline/OutlineTree.js";
export type { OutlineTreeProps } from "./react/Outline/OutlineTree.js";

export { MarkdownViewer } from "./react/MarkdownViewer.js";
export type { MarkdownViewerProps } from "./react/MarkdownViewer.js";
export { extractViewerHeadings, parseViewerMarkdown } from "./core/viewer/ast.js";
export type { ViewerAstNode, ViewerHeading } from "./core/viewer/ast.js";
