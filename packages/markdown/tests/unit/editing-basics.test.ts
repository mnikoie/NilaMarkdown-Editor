import { beforeEach, describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "../../src/core/schema/index.js";
import { parse } from "../../src/core/markdown/parse.js";
import { serialize } from "../../src/core/markdown/serialize.js";
import { autoPairPlugin } from "../../src/core/plugins/auto-pair.js";
import { taskListPlugin } from "../../src/core/plugins/task-list.js";
import { getActiveLink, setLink, unsetLink } from "../../src/core/commands/link.js";
import { toggleTaskItemAt, toggleTaskList } from "../../src/core/commands/task-list.js";
import { insertTable, isInTable, tableResizingPlugin } from "../../src/core/commands/table.js";

function run(state: EditorState, command: import("prosemirror-state").Command): EditorState {
  let next = state;
  expect(command(state, (tr) => { next = state.apply(tr); })).toBe(true);
  return next;
}

function makeView(md: string, plugins: import("prosemirror-state").Plugin[]) {
  const mount = document.createElement("div");
  document.body.append(mount);
  return new EditorView(mount, {
    state: EditorState.create({ doc: parse(md), schema, plugins }),
  });
}

function type(view: EditorView, text: string) {
  for (const ch of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp("handleTextInput", (handler) =>
      handler(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)),
    );
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}

describe("ویرایش‌های پایهٔ هم‌سطحِ Typora", () => {
  beforeEach(() => document.body.replaceChildren());

  it("Ctrl+K می‌تواند انتخاب را بی تغییرِ متن لینک کند", () => {
    let state = EditorState.create({ doc: parse("متنِ لینک\n"), schema });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 10)));
    state = run(state, setLink("https://example.com"));
    expect(serialize(state.doc)).toBe("[متنِ لینک](https://example.com)\n");
    expect(getActiveLink(state)?.href).toBe("https://example.com");
  });

  it("حذفِ لینک، متن را نگه می‌دارد", () => {
    let state = EditorState.create({ doc: parse("[متن](https://example.com)\n"), schema });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
    state = run(state, unsetLink);
    expect(serialize(state.doc)).toBe("متن\n");
  });

  it("ویرایشِ لینک، قطعه‌های bold همان لینک را یک‌جا نگه می‌دارد", () => {
    let state = EditorState.create({
      doc: parse("[یک **دو** سه](https://old.example)\n"),
      schema,
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6)));
    expect(getActiveLink(state)?.text).toBe("یک دو سه");
    state = run(state, setLink("https://new.example"));
    const markdown = serialize(state.doc);
    expect(markdown).not.toContain("https://old.example");
    expect(markdown).toContain("**دو**");
    expect(getActiveLink(state)?.text).toBe("یک دو سه");
  });

  it("پرانتز را جفت می‌کند و مکان‌نما را میانِ آن می‌گذارد", () => {
    const view = makeView("\n", [autoPairPlugin()]);
    type(view, "(");
    expect(view.state.doc.textContent).toBe("()");
    expect(view.state.selection.from).toBe(2);
    view.destroy();
  });

  it("نوشتنِ بستِ موجود آن را دوباره درج نمی‌کند", () => {
    const view = makeView("\n", [autoPairPlugin()]);
    type(view, "[");
    type(view, "]");
    expect(view.state.doc.textContent).toBe("[]");
    expect(view.state.selection.from).toBe(3);
    view.destroy();
  });

  it("انتخاب را داخلِ گیومه می‌گذارد", () => {
    const view = makeView("متن\n", [autoPairPlugin()]);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 4)));
    type(view, '"');
    expect(view.state.doc.textContent).toBe('"متن"');
    view.destroy();
  });

  it("پاراگراف را به چک‌لیست تبدیل می‌کند", () => {
    let state = EditorState.create({ doc: parse("کار\n"), schema });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
    state = run(state, toggleTaskList);
    expect(serialize(state.doc)).toBe("- [ ] کار\n");
  });

  it("تیکِ آیتمِ چک‌لیست در Markdown ذخیره می‌شود", () => {
    let state = EditorState.create({ doc: parse("- [ ] کار\n"), schema });
    let pos = -1;
    state.doc.descendants((node, nodePos) => {
      if (node.type === schema.nodes.list_item) pos = nodePos;
    });
    state = run(state, toggleTaskItemAt(pos));
    expect(serialize(state.doc)).toBe("- [x] کار\n");
  });

  it("چک‌لیست دکمهٔ واقعیِ قابل‌فوکوس دارد", () => {
    const view = makeView("- [ ] کار\n", [taskListPlugin()]);
    const button = view.dom.querySelector<HTMLButtonElement>(".tm-task-checkbox");
    expect(button?.getAttribute("role")).toBe("checkbox");
    expect(button?.getAttribute("aria-checked")).toBe("false");
    button?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(serialize(view.state.doc)).toBe("- [x] کار\n");
    view.destroy();
  });

  it("پس از درجِ جدول، مکان‌نما داخلِ سلولِ اول است", () => {
    let state = EditorState.create({ doc: parse("\n"), schema, plugins: [tableResizingPlugin()] });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)));
    state = run(state, insertTable(3, 3));
    expect(isInTable(state)).toBe(true);
    expect(state.selection.$from.parent.type.spec.tableRole).toMatch(/cell/);
  });
});
