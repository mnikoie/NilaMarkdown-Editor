import type { Command, EditorState, Transaction } from "prosemirror-state";
import { wrapInList } from "prosemirror-schema-list";
import { schema } from "../schema/index.js";

function selectedListItems(state: EditorState): Array<{ pos: number; checked: boolean | null }> {
  const result: Array<{ pos: number; checked: boolean | null }> = [];
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
    if (node.type === schema.nodes.list_item) {
      result.push({ pos, checked: node.attrs.checked as boolean | null });
    }
  });

  if (result.length === 0) {
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type === schema.nodes.list_item) {
        result.push({
          pos: $from.before(depth),
          checked: $from.node(depth).attrs.checked as boolean | null,
        });
        break;
      }
    }
  }
  return result;
}

function markItemsAsTasks(tr: Transaction): Transaction {
  const positions: number[] = [];
  tr.doc.nodesBetween(tr.selection.from, tr.selection.to, (node, pos) => {
    if (node.type === schema.nodes.list_item) positions.push(pos);
  });
  if (positions.length === 0) {
    const { $from } = tr.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type === schema.nodes.list_item) {
        positions.push($from.before(depth));
        break;
      }
    }
  }
  for (const pos of positions) {
    const node = tr.doc.nodeAt(pos);
    if (node?.type === schema.nodes.list_item) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: false });
    }
  }
  return tr;
}

/** تبدیلِ انتخاب به چک‌لیست؛ اجرای دوباره روی چک‌لیست آن را فهرستِ عادی می‌کند. */
export const toggleTaskList: Command = (state, dispatch) => {
  const items = selectedListItems(state);
  if (items.length > 0) {
    const makePlain = items.every((item) => item.checked !== null);
    if (dispatch) {
      const tr = state.tr;
      for (const item of items) {
        const node = tr.doc.nodeAt(item.pos);
        if (node?.type === schema.nodes.list_item) {
          tr.setNodeMarkup(item.pos, undefined, {
            ...node.attrs,
            checked: makePlain ? null : false,
          });
        }
      }
      dispatch(tr);
    }
    return true;
  }

  return wrapInList(schema.nodes.bullet_list)(state, (tr) => dispatch?.(markItemsAsTasks(tr)));
};

/** تیکِ یک آیتم را عوض می‌کند. */
export function toggleTaskItemAt(pos: number): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos);
    if (node?.type !== schema.nodes.list_item || node.attrs.checked === null) return false;
    dispatch?.(
      state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        checked: !(node.attrs.checked as boolean),
      }),
    );
    return true;
  };
}

export function isTaskList(state: EditorState): boolean {
  return selectedListItems(state).some((item) => item.checked !== null);
}
