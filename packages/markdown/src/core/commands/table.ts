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
