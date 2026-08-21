import { lift, setBlockType, wrapIn } from "prosemirror-commands";
import { liftListItem, sinkListItem, wrapInList } from "prosemirror-schema-list";
import { Selection, TextSelection } from "prosemirror-state";
import type { Command } from "prosemirror-state";
import { schema } from "../schema/index.js";

export const setParagraph: Command = setBlockType(schema.nodes.paragraph);

/** سطحِ عنوان را در جهتِ ساختاری عوض می‌کند؛ بعد از H6 پاراگراف است. */
export function changeHeadingLevel(direction: "increase" | "decrease"): Command {
  return (state, dispatch) => {
    const node = state.selection.$from.parent;
    if (node.type !== schema.nodes.heading) {
      return direction === "increase"
        ? setBlockType(schema.nodes.heading, { level: 6 })(state, dispatch)
        : false;
    }

    const level = Number(node.attrs.level);
    const next = direction === "increase" ? level - 1 : level + 1;
    if (next < 1) return false;
    if (next > 6) return setParagraph(state, dispatch);
    return setBlockType(schema.nodes.heading, { level: next })(state, dispatch);
  };
}

function inside(state: Parameters<Command>[0], type: typeof schema.nodes.blockquote): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type === type) return true;
  }
  return false;
}

export const toggleBlockquote: Command = (state, dispatch) =>
  inside(state, schema.nodes.blockquote)
    ? lift(state, dispatch)
    : wrapIn(schema.nodes.blockquote)(state, dispatch);

function toggleList(type: typeof schema.nodes.bullet_list): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type === type) {
        return liftListItem(schema.nodes.list_item)(state, dispatch);
      }
    }
    return wrapInList(type)(state, dispatch);
  };
}

export const toggleBulletList = toggleList(schema.nodes.bullet_list);
export const toggleOrderedList = toggleList(schema.nodes.ordered_list);
export const indentListItem = sinkListItem(schema.nodes.list_item);
export const outdentListItem = liftListItem(schema.nodes.list_item);

function textblockDepth(state: Parameters<Command>[0]): number | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).isTextblock) return depth;
  }
  return null;
}

function insertParagraph(side: "before" | "after"): Command {
  return (state, dispatch) => {
    const depth = textblockDepth(state);
    if (depth === null) return false;
    const $from = state.selection.$from;
    const pos = side === "before" ? $from.before(depth) : $from.after(depth);
    if (!dispatch) return true;
    const tr = state.tr.insert(pos, schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1), 1));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export const insertParagraphBefore = insertParagraph("before");
export const insertParagraphAfter = insertParagraph("after");

function insertBlock(node: ReturnType<(typeof schema.nodes.math_block)["create"]>): Command {
  return (state, dispatch) => {
    if (!dispatch) return true;
    const tr = state.tr.replaceSelectionWith(node);
    tr.setSelection(Selection.near(tr.doc.resolve(Math.min(tr.selection.from, tr.doc.content.size))));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export const insertMathBlock = (): Command =>
  insertBlock(schema.nodes.math_block.create({ value: "" }));

export const insertHorizontalRule = (): Command =>
  insertBlock(schema.nodes.horizontal_rule.create());

export const insertTableOfContents = (): Command =>
  insertBlock(schema.nodes.table_of_contents.create());

export function insertAlert(type: "note" | "tip" | "important" | "warning" | "caution"): Command {
  return insertBlock(
    schema.nodes.directive_block.create(
      { name: type, attributes: {}, label: null, syntax: "alert" },
      schema.nodes.paragraph.create(),
    ),
  );
}

export const insertYamlFrontMatter: Command = (state, dispatch) => {
  if (state.doc.firstChild?.type === schema.nodes.front_matter) return false;
  if (!dispatch) return true;
  const node = schema.nodes.front_matter.create({ value: "" });
  const tr = state.tr.insert(0, node);
  tr.setSelection(TextSelection.near(tr.doc.resolve(1), 1));
  dispatch(tr.scrollIntoView());
  return true;
};

/** مرجع و تعریفِ پانویس را هم‌زمان می‌سازد. */
export const insertFootnote: Command = (state, dispatch) => {
  const used = new Set<string>();
  state.doc.descendants((node) => {
    if (node.type === schema.nodes.footnote_reference || node.type === schema.nodes.footnote_definition) {
      used.add(String(node.attrs.identifier));
    }
  });
  let number = 1;
  while (used.has(String(number))) number++;
  const identifier = String(number);

  if (!dispatch) return true;
  const selected = state.selection.empty
    ? ""
    : state.doc.textBetween(state.selection.from, state.selection.to, " ");
  const reference = schema.nodes.footnote_reference.create({ identifier, label: identifier });
  const definition = schema.nodes.footnote_definition.create(
    { identifier, label: identifier },
    schema.nodes.paragraph.create(null, selected ? schema.text(selected) : undefined),
  );
  const tr = state.tr.replaceSelectionWith(reference);
  const cursor = tr.selection.from;
  tr.insert(tr.doc.content.size, definition);
  tr.setSelection(TextSelection.near(tr.doc.resolve(cursor), 1));
  dispatch(tr.scrollIntoView());
  return true;
};
