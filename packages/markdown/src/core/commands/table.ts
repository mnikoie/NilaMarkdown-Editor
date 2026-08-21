import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  goToNextCell,
  isInTable,
  columnResizing,
  tableEditing,
} from "prosemirror-tables";
import { TextSelection } from "prosemirror-state";
import type { Command, EditorState, Transaction } from "prosemirror-state";
import type { Plugin } from "prosemirror-state";
import { Fragment } from "prosemirror-model";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../schema/index.js";

/**
 * فرمان‌های جدول.
 *
 * بیشترشان مستقیم از `prosemirror-tables` می‌آیند؛ اینجا فقط دوباره
 * صادر می‌شوند تا مصرف‌کننده مجبور نباشد آن پکیج را جدا نصب کند.
 */

export {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  goToNextCell,
  isInTable,
};

/** افزونهٔ لازم برای انتخابِ سلول و کشیدنِ مرزها. */
export function tableEditingPlugin(): Plugin {
  return tableEditing({ allowTableNodeSelection: false });
}

/** کشیدنِ مرزِ ستون‌ها؛ جداست تا APIِ قبلیِ `tableEditingPlugin` نشکند. */
export function tableResizingPlugin(): Plugin {
  return columnResizing({ handleWidth: 6, cellMinWidth: 48, lastColumnResizable: true });
}

/**
 * درجِ جدولِ نو.
 *
 * ردیفِ اول همیشه header است — در GFM جدولِ بی header وجود ندارد.
 */
export function insertTable(rows = 3, cols = 3): Command {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const { table, table_row, table_header, table_cell, paragraph } = schema.nodes;

    const headerCells = Array.from({ length: cols }, () => table_header.create());
    const bodyRows = Array.from({ length: Math.max(0, rows - 1) }, () =>
      table_row.create(null, Array.from({ length: cols }, () => table_cell.create())),
    );

    const node = table.create(null, [table_row.create(null, headerCells), ...bodyRows]);

    if (dispatch) {
      const insertionStart = state.selection.from;
      const tr = state.tr.replaceSelectionWith(node);
      // اگر جدول در انتهای سند درج شود، جایی برای مکان‌نما بعدش نمی‌ماند.
      const end = tr.selection.$to.pos;
      if (tr.doc.nodeAt(end) === null && end >= tr.doc.content.size - 1) {
        tr.insert(tr.doc.content.size, paragraph.create());
      }
      // بعد از درج، کاربر باید بی کلیکِ اضافه در سلولِ اول تایپ کند.
      const tableStart = tr.mapping.map(insertionStart, -1);
      const firstCell = Math.min(tableStart + 3, tr.doc.content.size);
      tr.setSelection(TextSelection.near(tr.doc.resolve(firstCell), 1));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** تنظیمِ ترازِ ستونِ فعلی. */
export function setColumnAlign(align: "left" | "center" | "right" | null): Command {
  return (state, dispatch) => {
    if (!isInTable(state)) return false;
    if (!dispatch) return true;

    const { $from } = state.selection;
    // شمارهٔ سلول در ردیف = شمارهٔ ستون.
    let cellDepth = $from.depth;
    while (cellDepth > 0 && !$from.node(cellDepth).type.spec.tableRole?.includes("cell")) {
      cellDepth--;
    }
    if (cellDepth === 0) return false;

    const colIndex = $from.index(cellDepth - 1);
    const tableDepth = cellDepth - 2;
    const tableNode = $from.node(tableDepth);
    const tableStart = $from.start(tableDepth);

    const tr = state.tr;
    let offset = tableStart;
    tableNode.forEach((row) => {
      let cellOffset = offset + 1;
      row.forEach((cell, cellPos, index) => {
        if (index === colIndex) {
          tr.setNodeMarkup(cellOffset, undefined, { ...cell.attrs, align });
        }
        cellOffset += cell.nodeSize;
        void cellPos;
      });
      offset += row.nodeSize;
    });

    dispatch(tr);
    return true;
  };
}

interface TableContext {
  table: PMNode;
  tablePos: number;
  rowIndex: number;
  colIndex: number;
}

function tableContext(state: EditorState): TableContext | null {
  const { $from } = state.selection;
  let cellDepth = $from.depth;
  while (cellDepth > 0 && !$from.node(cellDepth).type.spec.tableRole?.includes("cell")) cellDepth--;
  if (cellDepth === 0) return null;
  const rowDepth = cellDepth - 1;
  const tableDepth = cellDepth - 2;
  return {
    table: $from.node(tableDepth),
    tablePos: $from.before(tableDepth),
    rowIndex: $from.index(tableDepth),
    colIndex: $from.index(rowDepth),
  };
}

function cellTextPosition(table: PMNode, tablePos: number, rowIndex: number, colIndex: number): number {
  let pos = tablePos + 1;
  for (let row = 0; row < rowIndex; row++) pos += table.child(row).nodeSize;
  pos += 1;
  const targetRow = table.child(rowIndex);
  for (let col = 0; col < colIndex; col++) pos += targetRow.child(col).nodeSize;
  return pos + 1;
}

/** جابه‌جایی ردیفِ فعلی، با حفظِ محتوای همهٔ سلول‌ها. */
export function moveRow(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const ctx = tableContext(state);
    if (!ctx) return false;
    const target = ctx.rowIndex + direction;
    if (target < 0 || target >= ctx.table.childCount) return false;
    if (!dispatch) return true;

    const rows: PMNode[] = [];
    ctx.table.forEach((row) => rows.push(row));
    [rows[ctx.rowIndex], rows[target]] = [rows[target]!, rows[ctx.rowIndex]!];
    const table = ctx.table.copy(Fragment.fromArray(rows));
    const tr = state.tr.replaceWith(ctx.tablePos, ctx.tablePos + ctx.table.nodeSize, table);
    const cursor = cellTextPosition(table, ctx.tablePos, target, Math.min(ctx.colIndex, table.child(target).childCount - 1));
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursor), 1));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/** جابه‌جایی ستونِ فعلی در تمامِ ردیف‌ها. */
export function moveColumn(direction: -1 | 1): Command {
  return (state, dispatch) => {
    const ctx = tableContext(state);
    if (!ctx) return false;
    const target = ctx.colIndex + direction;
    const columnCount = ctx.table.firstChild?.childCount ?? 0;
    if (target < 0 || target >= columnCount) return false;
    if (!dispatch) return true;

    const rows: PMNode[] = [];
    ctx.table.forEach((row) => {
      const cells: PMNode[] = [];
      row.forEach((cell) => cells.push(cell));
      if (ctx.colIndex < cells.length && target < cells.length) {
        [cells[ctx.colIndex], cells[target]] = [cells[target]!, cells[ctx.colIndex]!];
      }
      rows.push(row.copy(Fragment.fromArray(cells)));
    });
    const table = ctx.table.copy(Fragment.fromArray(rows));
    const tr = state.tr.replaceWith(ctx.tablePos, ctx.tablePos + ctx.table.nodeSize, table);
    const cursor = cellTextPosition(table, ctx.tablePos, ctx.rowIndex, target);
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursor), 1));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/** جابه‌جاییِ دیداریِ چپ/راست؛ در جدولِ RTL جهتِ منطقی برعکس است. */
export function moveColumnVisual(direction: "left" | "right"): Command {
  return (state, dispatch, view) => {
    const rtl = view ? getComputedStyle(view.dom).direction === "rtl" : false;
    const logical = direction === "left" ? (rtl ? 1 : -1) : rtl ? -1 : 1;
    return moveColumn(logical)(state, dispatch, view);
  };
}

export function currentTable(state: EditorState): PMNode | null {
  return tableContext(state)?.table ?? null;
}
