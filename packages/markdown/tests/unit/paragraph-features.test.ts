import { beforeEach, describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "../../src/core/schema/index.js";
import { parse } from "../../src/core/markdown/parse.js";
import { serialize } from "../../src/core/markdown/serialize.js";
import {
  changeHeadingLevel,
  insertAlert,
  insertFootnote,
  insertTableOfContents,
  insertYamlFrontMatter,
} from "../../src/core/commands/paragraph.js";
import { setReferenceLink } from "../../src/core/commands/link.js";
import { moveColumn, moveRow } from "../../src/core/commands/table.js";
import { clearFormatting, insertImage } from "../../src/core/commands/format.js";
import { listFoldKey, listFoldPlugin } from "../../src/core/plugins/list-fold.js";

function run(state: EditorState, command: import("prosemirror-state").Command): EditorState {
  let next = state;
  expect(command(state, (tr) => { next = state.apply(tr); })).toBe(true);
  return next;
}

function selectionInCell(doc: import("prosemirror-model").Node, row: number, col: number): number {
  let found = -1;
  let rowIndex = -1;
  doc.descendants((node, pos) => {
    if (node.type === schema.nodes.table_row) rowIndex++;
    if (
      rowIndex === row &&
      (node.type === schema.nodes.table_cell || node.type === schema.nodes.table_header)
    ) {
      const parentRow = doc.resolve(pos + 1).node(-1);
      let index = 0;
      parentRow.forEach((cell) => {
        if (cell === node && index === col) found = pos + 1;
        index++;
      });
    }
  });
  return found;
}

describe("قابلیت‌های منوی Paragraph", () => {
  beforeEach(() => document.body.replaceChildren());

  it.each(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"])(
    "Alert نوع %s با قالب Typora رفت‌وبرگشت می‌کند",
    (type) => {
      const md = `> [!${type}]\n>\n> محتوا\n`;
      expect(serialize(parse(md))).toBe(md);
    },
  );

  it("directive هم‌نامِ note را به Alert تبدیل نمی‌کند", () => {
    const md = ":::note\nمحتوا\n:::\n";
    expect(serialize(parse(md))).toBe(md);
  });

  it("Alert تازه درج می‌کند", () => {
    let state = EditorState.create({ schema, doc: parse("متن\n") });
    state = run(state, insertAlert("warning"));
    expect(serialize(state.doc)).toContain("> [!WARNING]");
  });

  it("فهرست مطالب با [TOC] نگه داشته می‌شود", () => {
    const md = "[TOC]\n\n# فصل\n";
    const doc = parse(md);
    expect(doc.firstChild?.type).toBe(schema.nodes.table_of_contents);
    expect(serialize(doc)).toBe(md);
  });

  it("لینک مرجعی و definition را با هم می‌سازد", () => {
    let state = EditorState.create({ schema, doc: parse("متن\n") });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 4)));
    state = run(state, setReferenceLink("منبع", "https://example.com"));
    const markdown = serialize(state.doc);
    expect(markdown).toContain("[متن][منبع]");
    expect(markdown).toContain("[منبع]: https://example.com");
    const parsed = parse(markdown);
    expect(parsed.firstChild?.firstChild?.marks[0]?.attrs.href).toBe("https://example.com");
  });

  it("پانویس را همراه با تعریف می‌سازد", () => {
    let state = EditorState.create({ schema, doc: parse("توضیح\n") });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 6)));
    state = run(state, insertFootnote);
    const markdown = serialize(state.doc);
    expect(markdown).toContain("[^1]");
    expect(markdown).toContain("[^1]: توضیح");
  });

  it("YAML فقط یک بار در ابتدای سند درج می‌شود", () => {
    let state = EditorState.create({ schema, doc: parse("متن\n") });
    state = run(state, insertYamlFrontMatter);
    expect(state.doc.firstChild?.type).toBe(schema.nodes.front_matter);
    expect(insertYamlFrontMatter(state)).toBe(false);
  });

  it("افزایش و کاهش سطح عنوان مرز H1 تا پاراگراف را رعایت می‌کند", () => {
    let state = EditorState.create({ schema, doc: parse("## عنوان\n") });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
    state = run(state, changeHeadingLevel("increase"));
    expect(state.doc.firstChild?.attrs.level).toBe(1);
    state = run(state, changeHeadingLevel("decrease"));
    expect(state.doc.firstChild?.attrs.level).toBe(2);
  });

  it("ردیف و ستون جدول را جابه‌جا می‌کند", () => {
    const md = "| سر۱ | سر۲ |\n| --- | --- |\n| الف | ب |\n| ج | د |\n";
    let state = EditorState.create({ schema, doc: parse(md) });
    let pos = selectionInCell(state.doc, 1, 0);
    expect(pos).toBeGreaterThan(0);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
    state = run(state, moveRow(1));
    expect(serialize(state.doc).indexOf("| ج")).toBeLessThan(serialize(state.doc).indexOf("| الف"));

    pos = selectionInCell(state.doc, 1, 0);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
    state = run(state, moveColumn(1));
    expect(serialize(state.doc)).toContain("| سر۲ | سر۱ |");
  });

  it("زیرخطِ Typora با HTML رفت‌وبرگشت می‌کند", () => {
    const md = "متن <u>زیرخط</u> عادی\n";
    const doc = parse(md);
    expect(doc.firstChild?.child(1).marks.some((mark) => mark.type === schema.marks.underline)).toBe(true);
    expect(serialize(doc)).toBe(md);
  });

  it("Comment پنهان حذف نمی‌شود", () => {
    const md = "قبل <!--یادداشت--> بعد\n";
    const doc = parse(md);
    expect(doc.textContent).toContain("یادداشت");
    expect(serialize(doc)).toBe(md);
  });

  it("پاک‌کردن قالب‌بندی متن را نگه می‌دارد", () => {
    let state = EditorState.create({ schema, doc: parse("**متن**\n") });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 4)));
    state = run(state, clearFormatting);
    expect(state.doc.textContent).toBe("متن");
    expect(state.doc.firstChild?.firstChild?.marks).toHaveLength(0);
  });

  it("تصویر نشانی‌محور درج می‌شود", () => {
    let state = EditorState.create({ schema, doc: parse("متن\n") });
    state = run(state, insertImage("https://example.com/a.png", "نمونه"));
    expect(serialize(state.doc)).toContain("![نمونه](https://example.com/a.png)");
  });
});

describe("زیرگره‌های تاشوندهٔ فهرست", () => {
  beforeEach(() => document.body.replaceChildren());

  it("برای والدِ دارای فهرست تودرتو دکمه می‌سازد و زیرگره را پنهان می‌کند", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const view = new EditorView(mount, {
      state: EditorState.create({
        schema,
        doc: parse("- والد\n  - فرزند\n    - نوه\n"),
        plugins: [listFoldPlugin()],
      }),
    });

    const button = view.dom.querySelector<HTMLButtonElement>(".tm-list-fold-toggle");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-expanded")).toBe("true");
    button?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(listFoldKey.getState(view.state)?.folded.size).toBe(1);
    expect(view.dom.querySelector(".tm-list-folded-hidden")).not.toBeNull();
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    view.destroy();
  });
});
