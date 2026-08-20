/** ورودیِ ویرایشگر. */

export { schema, nodes, marks } from "./core/schema/index.js";
export { parse } from "./core/markdown/parse.js";
export { serialize } from "./core/markdown/serialize.js";

export { buildOutline, flattenOutline, nodeAt } from "./core/outline/build.js";
export { slugify, makeUnique } from "./core/outline/slug.js";
export type { OutlineNode, OutlineOptions } from "./core/outline/types.js";

export {
  foldPlugin,
  foldKey,
  toggleFold,
  foldAll,
  unfoldAll,
  isFolded,
} from "./core/plugins/fold.js";
export type { FoldState, FoldOptions } from "./core/plugins/fold.js";

export { BUILTIN_MARKS, RANK } from "./core/directives/builtin.js";
export type {
  MarkDefinition,
  MarkRegistry,
  DirectiveKind,
  AttrSpec,
  AttrType,
  MarkVariant,
} from "./core/directives/types.js";

export { MarkCardView, markCardViews } from "./node-views/MarkCard.js";
export { OutlineTree } from "./react/Outline/OutlineTree.js";
export type { OutlineTreeProps } from "./react/Outline/OutlineTree.js";
