import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { parse } from "../../src/core/markdown/parse.js";
import { serialize } from "../../src/core/markdown/serialize.js";
import { schema } from "../../src/core/schema/index.js";
import {
  livePreviewPlugin,
  livePreviewKey,
  activeBlocks,
} from "../../src/core/plugins/live-preview.js";

function makeState(md: string, options = {}) {
  return EditorState.create({
    doc: parse(md),
    schema,
    plugins: [livePreviewPlugin(options)],
  });
}

/**
 * متنِ واقعیِ نشانه‌ها، به ترتیبِ موقعیت.
 *
 * widget را با صداکردنِ `toDOM` می‌خوانیم — تستِ کلیدِ spec کافی نیست،
 * چون کلید درست بودن را ثابت نمی‌کند و `##` غلط هم از آن رد می‌شود.
 */
function markers(state: EditorState): string[] {
  return livePreviewKey
    .getState(state)!
    .decorations.find()
    .sort((a, b) => a.from - b.from)
    .map((d) => {
      const toDOM = (d as unknown as { type: { toDOM: unknown } }).type.toDOM;
      const el = typeof toDOM === "function" ? (toDOM as () => HTMLElement)() : (toDOM as HTMLElement);
      return el.textContent ?? "";
    });
}

function markerCount(state: EditorState): number {
  return livePreviewKey.getState(state)!.decorations.find().length;
}

/** مکان‌نما را به موقعیتِ داده‌شده می‌برد. */
function at(state: EditorState, pos: number): EditorState {
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
}

describe("پیش‌نمایشِ زنده", () => {
  it("مکان‌نما بیرونِ بلوک → نشانه‌ای دیده نمی‌شود", () => {
    // سند دو پاراگراف دارد؛ مکان‌نما در اولی است، پس دومی نشانه ندارد.
    const state = makeState("سلام **دنیا**\n\nپاراگرافِ دوم\n");
    const decos = livePreviewKey.getState(state)!.decorations.find();
    // مکان‌نما در ابتدای سند = داخلِ بلوکِ اول
    const secondBlockStart = state.doc.child(0).nodeSize;
    const inSecond = decos.filter((d) => d.from >= secondBlockStart);
    expect(inSecond).toHaveLength(0);
  });

  it("مکان‌نما داخلِ بلوک → نشانه‌ها پیدا می‌شوند", () => {
    const state = makeState("سلام **دنیا**\n");
    expect(markerCount(state)).toBe(2); // ** باز و **بسته
  });

  it("عنوان، نشانهٔ # با سطحِ درست نشان می‌دهد", () => {
    expect(markers(makeState("## عنوان\n"))).toEqual(["## "]);
    expect(markers(makeState("### سه\n"))).toEqual(["### "]);
    expect(markers(makeState("###### شش\n"))).toEqual(["###### "]);
  });

  it("★ حالتِ ۱ — انتخابِ چندبلوکی: هیچ بلوکی نشانه نشان نمی‌دهد", () => {
    let state = makeState("**یک**\n\n**دو**\n\n**سه**\n");
    // انتخاب از داخلِ بلوکِ اول تا داخلِ بلوکِ سوم
    const sel = TextSelection.create(state.doc, 2, state.doc.content.size - 2);
    state = state.apply(state.tr.setSelection(sel));

    expect(activeBlocks(state)).toEqual([]);
    expect(markerCount(state)).toBe(0);
  });

  it("انتخابِ چندبلوکی با گزینهٔ صریح، نشانه نشان می‌دهد", () => {
    let state = makeState("**یک**\n\n**دو**\n", { showOnMultiBlockSelection: true });
    const sel = TextSelection.create(state.doc, 2, state.doc.content.size - 2);
    state = state.apply(state.tr.setSelection(sel));
    expect(activeBlocks(state).length).toBe(2);
    expect(markerCount(state)).toBeGreaterThan(0);
  });

  it("★ حالتِ ۲ — گره‌های تودرتو: تأکید داخلِ لینک داخلِ عنوان", () => {
    const state = makeState("# سلام [**دنیا**](https://x.com)\n");
    // # + ** باز + ** بسته — لینک نشانهٔ متنی ندارد (براکت‌ها را CSS می‌کشد)
    expect(markerCount(state)).toBeGreaterThanOrEqual(3);
  });

  it("تأکیدِ تودرتو (پررنگ داخلِ کج) هر دو نشانه را می‌گیرد", () => {
    const state = makeState("*کج **و پررنگ** باز کج*\n");
    // * باز، ** باز، ** بسته، * بسته
    expect(markerCount(state)).toBe(4);
  });

  it("★ حالتِ ۵ — نشانه‌ها وارد سند نمی‌شوند", () => {
    const md = "سلام **دنیا** و `کد`\n";
    const state = makeState(md);
    // نشانه‌ها دیده می‌شوند…
    expect(markerCount(state)).toBeGreaterThan(0);
    // …ولی سند و خروجی دست‌نخورده‌اند.
    expect(serialize(state.doc)).toBe(md);
  });

  it("★ حالتِ ۵ — جابه‌جاییِ مکان‌نما سند را عوض نمی‌کند", () => {
    const md = "سلام **دنیا**\n\nدومی\n";
    let state = makeState(md);
    const before = state.doc.toJSON();

    state = at(state, state.doc.content.size - 2);

    expect(state.doc.toJSON()).toEqual(before);
    expect(serialize(state.doc)).toBe(md);
  });

  it("جابه‌جاییِ مکان‌نما قدمِ undo نمی‌سازد", () => {
    let state = makeState("سلام **دنیا**\n\nدومی\n");
    let changed = false;
    const tr = state.tr.setSelection(TextSelection.create(state.doc, 3));
    changed = tr.docChanged;
    state = state.apply(tr);
    expect(changed).toBe(false);
  });

  it("نشانهٔ کدِ درون‌خطی با تعدادِ بک‌تیکِ درست", () => {
    const state = makeState("متن `کد` است\n");
    expect(markerCount(state)).toBe(2);
  });

  it("خط‌خورده نشانه می‌گیرد", () => {
    const state = makeState("این ~~حذف~~ شد\n");
    expect(markerCount(state)).toBe(2);
  });

  it("متنِ بی‌نشانه، دکوریشنی نمی‌سازد", () => {
    const state = makeState("فقط متنِ ساده\n");
    expect(markerCount(state)).toBe(0);
  });

  it("سندِ خالی خطا نمی‌دهد", () => {
    const state = makeState("");
    expect(markerCount(state)).toBe(0);
  });

  it("بلوکِ کد نشانهٔ درون‌خطی نمی‌گیرد", () => {
    // داخلِ code_block هیچ markی مجاز نیست، پس نباید چیزی بسازد.
    const state = makeState("```ts\nconst a = 1;\n```\n");
    expect(markerCount(state)).toBe(0);
  });

  it("متنِ فارسی با نشانه — نیم‌فاصله خراب نمی‌شود", () => {
    const md = "این **می‌شود** درست\n";
    const state = makeState(md);
    expect(markerCount(state)).toBe(2);
    expect(serialize(state.doc)).toBe(md);
  });

  it("نشانهٔ __ و ** هرکدام خودشان می‌مانند", () => {
    const md = "__پررنگ__\n";
    const state = makeState(md);
    expect(markerCount(state)).toBe(2);
    // نشانهٔ اصلیِ کاربر حفظ شده
    expect(serialize(state.doc)).toBe(md);
  });

  it("تراکنشِ بی‌ربط، دکوریشن‌ها را بازنمی‌سازد", () => {
    let state = makeState("**یک**\n");
    const before = livePreviewKey.getState(state);
    // تراکنشی که نه سند را عوض می‌کند نه انتخاب را
    state = state.apply(state.tr.setMeta("چیزی", true));
    expect(livePreviewKey.getState(state)).toBe(before);
  });
});
