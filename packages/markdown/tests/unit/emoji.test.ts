import { beforeEach, describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { emojiShortnamePlugin } from "../../src/core/plugins/emoji.js";
import { parse } from "../../src/core/markdown/parse.js";
import { serialize } from "../../src/core/markdown/serialize.js";
import { schema } from "../../src/core/schema/index.js";

describe("نام کوتاه Emoji", () => {
  beforeEach(() => document.body.replaceChildren());

  it("فقط نمایش را عوض می‌کند و Markdown دست‌نخورده می‌ماند", () => {
    const markdown = "وضعیت :check: است\n";
    const mount = document.createElement("div");
    document.body.append(mount);
    const view = new EditorView(mount, {
      state: EditorState.create({ doc: parse(markdown), schema, plugins: [emojiShortnamePlugin()] }),
    });

    expect(view.dom.querySelector(".tm-emoji-shortname")?.textContent).toBe("✅");
    expect(serialize(view.state.doc)).toBe(markdown);
    view.destroy();
  });

  it("هنگام ویرایش خود نام خام را نشان می‌دهد", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const view = new EditorView(mount, {
      state: EditorState.create({ doc: parse("الف :smile: ب\n"), schema, plugins: [emojiShortnamePlugin()] }),
    });
    expect(view.dom.querySelector(".tm-emoji-shortname")).not.toBeNull();
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 7)));
    expect(view.dom.querySelector(".tm-emoji-shortname")).toBeNull();
    view.destroy();
  });
});
