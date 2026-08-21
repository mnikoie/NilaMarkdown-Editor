import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { history, undo } from "prosemirror-history";
import { schema } from "../../src/core/schema/index.js";
import { parse } from "../../src/core/markdown/parse.js";
import { serialize } from "../../src/core/markdown/serialize.js";
import {
  slashMenuPlugin,
  getSlashState,
  filterItems,
  allSlashItems,
  runSlashItem,
} from "../../src/core/plugins/slash-menu.js";
import { BUILTIN_MARKS } from "../../src/core/directives/builtin.js";

function makeState(md = "\n") {
  return EditorState.create({
    doc: parse(md),
    schema,
    plugins: [history(), slashMenuPlugin()],
  });
}

/** تایپِ متن از مسیرِ تراکنش — منو با تغییرِ سند فعال می‌شود. */
function type(state: EditorState, text: string): EditorState {
  const { from } = state.selection;
  return state.apply(state.tr.insertText(text, from));
}

function atEnd(state: EditorState): EditorState {
  const pos = state.doc.content.size - 1;
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
}

describe("فهرستِ آیتم‌ها", () => {
  it("بلوک‌های پایه هستند", () => {
    const ids = allSlashItems().map((i) => i.id);
    expect(ids).toContain("h1");
    expect(ids).toContain("table");
    expect(ids).toContain("code");
  });

  it("★ مارک‌های سفارشی خودکار می‌آیند", () => {
    // «مکانیزم عمومی است» یعنی این: مارکِ نو، صفر خطِ کدِ جدید.
    const ids = allSlashItems(BUILTIN_MARKS).map((i) => i.id);
    expect(ids).toContain("mark-نکته");
    expect(ids).toContain("mark-هشدار");
  });

  it("مارکِ درون‌خطی در منو نمی‌آید", () => {
    // `ref` درون‌خطی است — با `/` درج نمی‌شود.
    const ids = allSlashItems(BUILTIN_MARKS).map((i) => i.id);
    expect(ids).not.toContain("mark-ref");
  });

  it("مارکِ با inSlashMenu=false کنار گذاشته می‌شود", () => {
    const registry = {
      مخفی: { ...BUILTIN_MARKS.نکته!, name: "مخفی", inSlashMenu: false },
    };
    expect(allSlashItems(registry).map((i) => i.id)).not.toContain("mark-مخفی");
  });
});

describe("فیلتر", () => {
  const items = allSlashItems(BUILTIN_MARKS);

  it("عبارتِ خالی همه را می‌دهد", () => {
    expect(filterItems(items, "")).toHaveLength(items.length);
  });

  it("با نامِ فارسی پیدا می‌شود", () => {
    expect(filterItems(items, "جدول").map((i) => i.id)).toContain("table");
  });

  it("با کلیدواژهٔ انگلیسی هم پیدا می‌شود", () => {
    expect(filterItems(items, "table").map((i) => i.id)).toContain("table");
  });

  it("★ املای عربی هم کار می‌کند", () => {
    // «نكته» با کافِ عربی
    expect(filterItems(items, "نكته").map((i) => i.id)).toContain("mark-نکته");
  });

  it("عبارتِ بی‌تطبیق، فهرستِ خالی می‌دهد", () => {
    expect(filterItems(items, "چیزِ‌کاملاً‌ناموجود")).toHaveLength(0);
  });
});

describe("باز و بسته شدنِ منو", () => {
  it("در آغاز بسته است", () => {
    expect(getSlashState(makeState()).active).toBe(false);
  });

  it("★ با `/` در ابتدای بلوک باز می‌شود", () => {
    const state = type(atEnd(makeState()), "/");
    expect(getSlashState(state).active).toBe(true);
  });

  it("★ `/` وسطِ کلمه منو را باز نمی‌کند", () => {
    // وگرنه هر نشانیِ اینترنتی منو را باز می‌کرد.
    let state = type(atEnd(makeState()), "http:");
    state = type(state, "/");
    expect(getSlashState(state).active).toBe(false);
  });

  it("`/` بعد از فاصله باز می‌شود", () => {
    let state = type(atEnd(makeState()), "متن ");
    state = type(state, "/");
    expect(getSlashState(state).active).toBe(true);
  });

  it("عبارت بعدِ `/` جمع می‌شود", () => {
    let state = type(atEnd(makeState()), "/");
    state = type(state, "جد");
    expect(getSlashState(state).query).toBe("جد");
    expect(getSlashState(state).items.map((i) => i.id)).toContain("table");
  });

  it("با فاصله بسته می‌شود", () => {
    let state = type(atEnd(makeState()), "/");
    expect(getSlashState(state).active).toBe(true);
    state = type(state, " ");
    expect(getSlashState(state).active).toBe(false);
  });

  it("★ داخلِ بلوکِ کد باز نمی‌شود", () => {
    // در کد، `/` کاراکترِ عادی است (مثلاً در نشانی یا تقسیم).
    const state = makeState("```ts\nx\n```\n");

    // موقعیتِ داخلِ بلوکِ کد را از خودِ سند پیدا می‌کنیم — عددِ ثابت
    // شکننده است و ممکن است بیرونِ گره بیفتد.
    let inside = -1;
    state.doc.descendants((node, pos) => {
      if (node.type.name === "code_block") inside = pos + 1;
      return true;
    });
    expect(inside).toBeGreaterThan(0);

    const inCode = state.apply(state.tr.setSelection(TextSelection.create(state.doc, inside)));
    expect(inCode.selection.$from.parent.type.name).toBe("code_block");
    expect(getSlashState(type(inCode, "/")).active).toBe(false);
  });
});

describe("اجرای آیتم", () => {
  /** منو را باز می‌کند و آیتمِ خواسته‌شده را اجرا. */
  function runById(md: string, typed: string, id: string) {
    let state = atEnd(makeState(md));
    for (const ch of typed) state = type(state, ch);
    const s = getSlashState(state);
    const item = s.items.find((i) => i.id === id);
    if (!item) throw new Error(`آیتمِ ${id} در منو نیست`);
    runSlashItem(state, (tr) => (state = state.apply(tr)), item, s);
    return state;
  }

  it("★ عنوان ساخته می‌شود و متنِ `/` پاک", () => {
    const state = runById("\n", "/عنوان", "h1");
    expect(state.doc.firstChild?.type.name).toBe("heading");
    // ★ متنِ `/عنوان` نباید در سند بماند
    expect(serialize(state.doc)).not.toContain("/");
  });

  it("★ جدول درج می‌شود", () => {
    const state = runById("\n", "/جدول", "table");
    expect(serialize(state.doc)).toContain("|");
    expect(serialize(state.doc)).not.toContain("/جدول");
  });

  it("★ کارتِ مارکِ سفارشی درج می‌شود", () => {
    const state = runById("\n", "/نکته", "mark-نکته");
    const out = serialize(state.doc);
    expect(out).toContain(":::نکته");
    expect(out).not.toContain("/نکته");
  });

  it("منو بعدِ اجرا بسته می‌شود", () => {
    const state = runById("\n", "/جدول", "table");
    expect(getSlashState(state).active).toBe(false);
  });

  it("★★ undo یک قدم است، نه دو", () => {
    // اگر پاک‌کردنِ `/` و درجِ بلوک دو تراکنش باشند، کاربر با یک Ctrl+Z
    // می‌بیند که `/جدول` برمی‌گردد — گیج‌کننده است.
    let state = runById("\n", "/جدول", "table");
    expect(serialize(state.doc)).toContain("|");

    undo(state, (tr) => (state = state.apply(tr)));
    const out = serialize(state.doc);
    expect(out).not.toContain("|");
    expect(out).not.toContain("/جدول");
  });
});
