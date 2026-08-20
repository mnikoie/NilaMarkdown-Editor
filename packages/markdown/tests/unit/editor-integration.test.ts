import { describe, it, expect, beforeEach } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history, undo } from "prosemirror-history";
import { schema } from "../../src/core/schema/index.js";
import { parse } from "../../src/core/markdown/parse.js";
import { serialize } from "../../src/core/markdown/serialize.js";
import { livePreviewPlugin } from "../../src/core/plugins/live-preview.js";
import { foldPlugin, toggleFold } from "../../src/core/plugins/fold.js";
import { inputRulesPlugin } from "../../src/core/plugins/input-rules.js";
import { keymapPlugin } from "../../src/core/plugins/keymap.js";
import { markCardViews } from "../../src/node-views/MarkCard.js";
import { BUILTIN_MARKS } from "../../src/core/directives/builtin.js";

/**
 * تستِ یکپارچه — همهٔ پلاگین‌ها با هم روی یک EditorViewِ واقعی.
 *
 * تستِ جدا‌جدای پلاگین‌ها ثابت نمی‌کند که کنارِ هم کار می‌کنند. اینجا
 * چیزی نزدیک به استفادهٔ واقعی ساخته می‌شود.
 */

function makeView(md = "") {
  const mount = document.createElement("div");
  document.body.append(mount);

  const state = EditorState.create({
    doc: parse(md),
    schema,
    plugins: [
      history(),
      keymapPlugin(),
      inputRulesPlugin(BUILTIN_MARKS),
      livePreviewPlugin(),
      foldPlugin({ registry: BUILTIN_MARKS }),
    ],
  });

  return new EditorView(mount, { state, nodeViews: markCardViews(BUILTIN_MARKS) });
}

/**
 * تایپِ متن در موقعیتِ فعلی، مثلِ کاربر.
 *
 * ★ باید از `handleTextInput` رد شود، نه `tr.insertText` مستقیم.
 * قواعدِ ورودی (`# ` → عنوان) روی `handleTextInput` می‌نشینند؛ تراکنشِ
 * مستقیم آنها را دور می‌زند و تست الکی سبز/قرمز می‌شود.
 */
function type(view: EditorView, text: string) {
  for (const ch of text) {
    const { from, to } = view.state.selection;
    const handled =
      view.someProp("handleTextInput", (f) =>
        f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)),
      ) ?? false;
    if (!handled) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}

/** فشردنِ یک کلید از راهِ handler‌های واقعیِ view. */
function press(view: EditorView, key: string, mods: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods });
  return view.someProp("handleKeyDown", (f) => f(view, event)) ?? false;
}

describe("ادیتور — یکپارچه", () => {
  let view: EditorView;

  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("سند رندر می‌شود و DOM می‌سازد", () => {
    view = makeView("# عنوان\n\nمتن\n");
    expect(view.dom.querySelector("h1")?.textContent).toContain("عنوان");
    expect(view.dom.querySelector("p")?.textContent).toContain("متن");
    view.destroy();
  });

  it("تایپِ متن، خروجیِ مارک‌داون را عوض می‌کند", () => {
    view = makeView("سلام\n");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 5)));
    type(view, " دنیا");
    expect(serialize(view.state.doc)).toBe("سلام دنیا\n");
    view.destroy();
  });

  it("★ قاعدهٔ ورودی: `# ` عنوان می‌سازد", () => {
    view = makeView("\n");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    type(view, "# ");
    expect(view.state.doc.firstChild?.type.name).toBe("heading");
    expect(view.state.doc.firstChild?.attrs.level).toBe(1);
    view.destroy();
  });

  it("★ قاعدهٔ ورودی: `### ` عنوانِ سطحِ ۳", () => {
    view = makeView("\n");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    type(view, "### ");
    expect(view.state.doc.firstChild?.attrs.level).toBe(3);
    view.destroy();
  });

  it("★ قاعدهٔ ورودی: `- ` فهرست می‌سازد و نشانه را نگه می‌دارد", () => {
    view = makeView("\n");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    type(view, "* ");
    expect(view.state.doc.firstChild?.type.name).toBe("bullet_list");
    expect(view.state.doc.firstChild?.attrs.marker).toBe("*");
    view.destroy();
  });

  it("★ قاعدهٔ ورودی با ارقامِ فارسی: `۱. ` فهرستِ شماره‌دار", () => {
    view = makeView("\n");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    type(view, "۱. ");
    expect(view.state.doc.firstChild?.type.name).toBe("ordered_list");
    view.destroy();
  });

  it("★ Shift+Space نیم‌فاصله درج می‌کند", () => {
    view = makeView("می\n");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
    const handled = press(view, " ", { shiftKey: true });
    expect(handled).toBe(true);
    type(view, "شود");
    expect(serialize(view.state.doc)).toBe("می‌شود\n");
    view.destroy();
  });

  it("Mod+B پررنگ می‌کند", () => {
    view = makeView("سلام\n");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 5)));
    expect(press(view, "b", { ctrlKey: true })).toBe(true);
    expect(serialize(view.state.doc)).toBe("**سلام**\n");
    view.destroy();
  });

  it("Mod+2 عنوانِ سطحِ ۲ می‌سازد و دوباره برمی‌گرداند", () => {
    view = makeView("متن\n");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    press(view, "2", { ctrlKey: true });
    expect(serialize(view.state.doc)).toBe("## متن\n");
    press(view, "2", { ctrlKey: true });
    expect(serialize(view.state.doc)).toBe("متن\n");
    view.destroy();
  });

  it("★ undo بعدِ قاعدهٔ ورودی، یک قدم برمی‌گردد", () => {
    view = makeView("\n");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    type(view, "# ");
    expect(view.state.doc.firstChild?.type.name).toBe("heading");
    undo(view.state, view.dispatch);
    expect(view.state.doc.firstChild?.type.name).toBe("paragraph");
    view.destroy();
  });

  it("★ کارتِ مارک با NodeView رندر می‌شود", () => {
    view = makeView(":::نکته{نویسنده=دفترِ فنی}\nمتنِ نکته\n:::\n");
    const card = view.dom.querySelector(".tm-mark");
    expect(card).not.toBeNull();
    expect(card?.getAttribute("data-mark")).toBe("نکته");
    expect(card?.querySelector(".tm-mark-title")?.textContent).toContain("نکتهٔ نویسنده");
    expect(card?.querySelector(".tm-mark-body")?.textContent).toContain("متنِ نکته");
    view.destroy();
  });

  it("★ مارکِ ناشناخته رندر می‌شود، خطا نمی‌دهد", () => {
    view = makeView(":::یک‌چیزِ‌ناشناخته{الف=ب}\nمحتوا\n:::\n");
    const card = view.dom.querySelector(".tm-mark");
    expect(card?.getAttribute("data-unknown")).toBe("true");
    expect(card?.textContent).toContain("محتوا");
    // و در خروجی سالم می‌ماند
    expect(serialize(view.state.doc)).toContain("یک‌چیزِ‌ناشناخته");
    view.destroy();
  });

  it("★ رنگِ مارک به CSS variable می‌رود، نه رنگِ هارد-کد", () => {
    view = makeView(":::هشدار\nمتن\n:::\n");
    const card = view.dom.querySelector(".tm-mark") as HTMLElement;
    expect(card.style.getPropertyValue("--tm-mark-base")).toBeTruthy();
    view.destroy();
  });

  it("★ وضعیتِ منسوخ روی کارت می‌نشیند", () => {
    view = makeView(":::ماده{شماره=۳۹ وضعیت=منسوخ}\nمتن\n:::\n");
    const card = view.dom.querySelector(".tm-mark");
    expect(card?.getAttribute("data-status")).toBe("منسوخ");
    expect(card?.querySelector(".tm-mark-title")?.textContent).toBe("ماده ۳۹");
    view.destroy();
  });

  it("★ نشانه‌های پیش‌نمایشِ زنده در DOM دیده می‌شوند", () => {
    view = makeView("سلام **دنیا**\n");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
    const shown = [...view.dom.querySelectorAll(".tm-marker")].map((el) => el.textContent);
    expect(shown).toEqual(["**", "**"]);
    view.destroy();
  });

  it("★ نشانه‌ها در متنِ سند نیستند — کپی، `**` نمی‌گیرد", () => {
    view = makeView("سلام **دنیا**\n");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
    // نشانه در DOM هست…
    expect(view.dom.querySelectorAll(".tm-marker").length).toBe(2);
    // …ولی در متنِ سند نیست.
    expect(view.state.doc.textContent).toBe("سلام دنیا");
    expect(serialize(view.state.doc)).toBe("سلام **دنیا**\n");
    view.destroy();
  });

  it("★ تاشدن، محتوا را از DOM پنهان می‌کند", () => {
    view = makeView("# فصل\n\nمتنِ داخل\n\n# فصل دو\n\nمتنِ دو\n");
    // مکان‌نما را بیرونِ بخشِ اول ببر تا شرطِ خودکار-بازشدن فعال نشود.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.doc.content.size - 2)));

    const before = view.dom.querySelectorAll(".tm-folded-hidden").length;
    toggleFold("فصل")(view.state, view.dispatch);
    const after = view.dom.querySelectorAll(".tm-folded-hidden").length;

    expect(before).toBe(0);
    expect(after).toBeGreaterThan(0);
    // خلاصه‌ای هم نشان داده می‌شود
    expect(view.dom.querySelector(".tm-fold-summary")?.textContent).toContain("پنهان");
    // و سند دست‌نخورده است
    expect(serialize(view.state.doc)).toBe("# فصل\n\nمتنِ داخل\n\n# فصل دو\n\nمتنِ دو\n");
    view.destroy();
  });

  it("سندِ خالی، ادیتورِ سالم می‌سازد", () => {
    view = makeView("");
    expect(view.state.doc.childCount).toBe(1);
    expect(serialize(view.state.doc)).toBe("");
    view.destroy();
  });

  it("ویرایشِ سندِ حقوقی، ساختار را نمی‌شکند", () => {
    const md = "# فصل اول {#f1}\n\n::::ماده{شماره=۵۰}\nمتن\n\n:::تبصره{شماره=۱}\nزیرمتن\n:::\n::::\n";
    view = makeView(md);
    expect(serialize(view.state.doc)).toBe(md);
    view.destroy();
  });
});
