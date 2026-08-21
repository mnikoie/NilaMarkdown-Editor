import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { schema } from "../schema/index.js";
import { toggleTaskItemAt } from "../commands/task-list.js";

function decorations(doc: import("prosemirror-model").Node): DecorationSet {
  const result: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type !== schema.nodes.list_item || node.attrs.checked === null) return;
    const checked = Boolean(node.attrs.checked);
    result.push(
      Decoration.widget(
        pos + 1,
        () => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "tm-task-checkbox";
          button.contentEditable = "false";
          button.dataset.taskPos = String(pos);
          button.setAttribute("role", "checkbox");
          button.setAttribute("aria-checked", String(checked));
          button.setAttribute("aria-label", checked ? "علامت‌زدن به‌عنوان انجام‌نشده" : "علامت‌زدن به‌عنوان انجام‌شده");
          button.textContent = checked ? "✓" : "";
          return button;
        },
        // کلید عمداً حالتِ تیک را ندارد. اگر با هر تیک DOMِ دکمه عوض
        // شود، عنصر بینِ mousedown و mouseup جدا می‌شود و click کامل
        // نمی‌شود. حالت در `view.update` همگام می‌شود.
        { side: -1, key: `task-${pos}` },
      ),
    );
  });
  return DecorationSet.create(doc, result);
}

function syncButtons(view: import("prosemirror-view").EditorView): void {
  for (const button of view.dom.querySelectorAll<HTMLButtonElement>(".tm-task-checkbox")) {
    const pos = Number(button.dataset.taskPos);
    const node = Number.isInteger(pos) ? view.state.doc.nodeAt(pos) : null;
    if (node?.type !== schema.nodes.list_item || node.attrs.checked === null) continue;
    const checked = Boolean(node.attrs.checked);
    button.setAttribute("aria-checked", String(checked));
    button.setAttribute(
      "aria-label",
      checked ? "علامت‌زدن به‌عنوان انجام‌نشده" : "علامت‌زدن به‌عنوان انجام‌شده",
    );
    button.textContent = checked ? "✓" : "";
  }
}

function runFromTarget(view: import("prosemirror-view").EditorView, target: EventTarget | null): boolean {
  const button = target instanceof HTMLElement ? target.closest<HTMLButtonElement>(".tm-task-checkbox") : null;
  if (!button) return false;
  const pos = Number(button.dataset.taskPos);
  if (!Number.isInteger(pos)) return false;
  return toggleTaskItemAt(pos)(view.state, view.dispatch);
}

/** دکمهٔ واقعی و دسترس‌پذیر برای تیک‌زدنِ چک‌لیست. */
export function taskListPlugin(): Plugin {
  return new Plugin({
    view: (view) => ({
      update: (next) => syncButtons(next),
    }),
    props: {
      decorations: (state) => decorations(state.doc),
      handleDOMEvents: {
        mousedown(view, event) {
          if (!(event.target instanceof HTMLElement) || !event.target.closest(".tm-task-checkbox")) return false;
          event.preventDefault();
          return runFromTarget(view, event.target);
        },
        keydown(view, event) {
          if (event.key !== " " && event.key !== "Enter") return false;
          if (!(event.target instanceof HTMLElement) || !event.target.closest(".tm-task-checkbox")) return false;
          event.preventDefault();
          return runFromTarget(view, event.target);
        },
      },
    },
  });
}
