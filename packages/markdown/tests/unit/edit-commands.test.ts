import { describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { schema } from "../../src/core/schema/index.js";
import { parse } from "../../src/core/markdown/parse.js";
import { serialize } from "../../src/core/markdown/serialize.js";
import {
  deleteSelectionOrBlock,
  duplicateSelectionOrBlock,
  selectedMarkdown,
  selectedText,
} from "../../src/core/commands/edit.js";

function stateAt(md: string, from: number, to = from) {
  let state = EditorState.create({ doc: parse(md), schema });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
  return state;
}

function run(state: EditorState, command: import("prosemirror-state").Command) {
  let next = state;
  expect(command(state, (tr) => { next = state.apply(tr); })).toBe(true);
  return next;
}

describe("فرمان‌های منوی Edit", () => {
  it("متنِ انتخاب‌شده را بدون محتوای بیرون از انتخاب می‌دهد", () => {
    const state = stateAt("اول دوم\n", 1, 4);
    expect(selectedText(state)).toBe("اول");
  });

  it("Copy as Markdown مارکِ پررنگ را نگه می‌دارد", () => {
    const base = EditorState.create({ doc: parse("**پررنگ** ساده\n"), schema });
    const end = 1 + (base.doc.firstChild?.content.size ?? 0);
    const state = base.apply(base.tr.setSelection(TextSelection.create(base.doc, 1, end)));
    expect(selectedMarkdown(state)).toBe("**پررنگ** ساده");
  });

  it("بلوکِ جاری را در یک فرمان تکثیر می‌کند", () => {
    const next = run(stateAt("یک\n\nدو\n", 2), duplicateSelectionOrBlock);
    expect(serialize(next.doc)).toBe("یک\n\nیک\n\nدو\n");
  });

  it("فقط بخشِ انتخاب‌شده را تکثیر می‌کند", () => {
    const next = run(stateAt("الف ب\n", 1, 4), duplicateSelectionOrBlock);
    expect(next.doc.textContent).toBe("الفالف ب");
  });

  it("بلوکِ جاری را حذف می‌کند", () => {
    const next = run(stateAt("یک\n\nدو\n", 2), deleteSelectionOrBlock);
    expect(serialize(next.doc)).toBe("دو\n");
  });

  it("حذفِ تنها بلوک، سند را معتبر و قابلِ تایپ نگه می‌دارد", () => {
    const next = run(stateAt("تنها\n", 2), deleteSelectionOrBlock);
    expect(next.doc.childCount).toBe(1);
    expect(next.doc.firstChild?.type).toBe(schema.nodes.paragraph);
    expect(serialize(next.doc)).toBe("");
  });
});
