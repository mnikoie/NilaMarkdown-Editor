import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { undo, history } from "prosemirror-history";
import { schema } from "../../src/core/schema/index.js";
import { parse } from "../../src/core/markdown/parse.js";
import { serialize } from "../../src/core/markdown/serialize.js";
import {
  searchPlugin,
  search,
  searchNext,
  searchPrev,
  clearSearch,
  replaceActive,
  replaceAll,
  getSearchState,
  findMatches,
  normalizeForSearch,
} from "../../src/core/plugins/search.js";
import { foldPlugin, foldKey } from "../../src/core/plugins/fold.js";

function makeState(md: string) {
  return EditorState.create({
    doc: parse(md),
    schema,
    plugins: [history(), searchPlugin()],
  });
}

/** فرمان را اجرا و حالتِ نو را برمی‌گرداند. */
function run(state: EditorState, cmd: ReturnType<typeof search>): EditorState {
  let next = state;
  cmd(state, (tr) => (next = state.apply(tr)));
  return next;
}

describe("نرمال‌سازیِ فارسی", () => {
  it("★ طولِ رشته عوض نمی‌شود", () => {
    // اگر طول عوض شود، موقعیتِ تطبیق در سند غلط می‌شود.
    for (const s of ["كتاب", "مـتـن", "۱۲۳", "علی", "متنِ عادی"]) {
      expect(normalizeForSearch(s).length, s).toBe(s.length);
    }
  });

  it("کافِ عربی و فارسی یکی می‌شوند", () => {
    expect(normalizeForSearch("كتاب")).toBe(normalizeForSearch("کتاب"));
  });

  it("یِ عربی و فارسی یکی می‌شوند", () => {
    expect(normalizeForSearch("علي")).toBe(normalizeForSearch("علی"));
  });

  it("ارقامِ فارسی و انگلیسی یکی می‌شوند", () => {
    expect(normalizeForSearch("۱۲۳")).toBe("123");
  });
});

describe("پیدا کردن", () => {
  it("تطبیقِ ساده", () => {
    const doc = parse("سلام دنیا\n");
    expect(findMatches(doc, "دنیا")).toHaveLength(1);
  });

  it("چند تطبیق", () => {
    const doc = parse("یک دو یک سه یک\n");
    expect(findMatches(doc, "یک")).toHaveLength(3);
  });

  it("★ تطبیق در چند پاراگراف", () => {
    const doc = parse("متن یک\n\nمتن دو\n\nمتن سه\n");
    expect(findMatches(doc, "متن")).toHaveLength(3);
  });

  it("★ عبارت از یک پاراگراف به بعدی نمی‌چسبد", () => {
    // «یک» انتهای پاراگرافِ اول و «دو» ابتدای دومی — «یکدو» نباید پیدا شود.
    const doc = parse("یک\n\nدو\n");
    expect(findMatches(doc, "یکدو")).toHaveLength(0);
  });

  it("★ املای عربی با تایپِ فارسی پیدا می‌شود", () => {
    // سند «كتاب» با کافِ عربی دارد، کاربر «کتاب» فارسی تایپ می‌کند.
    const doc = parse("این كتاب است\n");
    expect(findMatches(doc, "کتاب")).toHaveLength(1);
  });

  it("★ «۵۰» و «50» هم را پیدا می‌کنند", () => {
    const doc = parse("ماده ۵۰ قانون\n");
    expect(findMatches(doc, "50")).toHaveLength(1);
    expect(findMatches(doc, "۵۰")).toHaveLength(1);
  });

  it("بی‌توجه به بزرگی و کوچکی، پیش‌فرض", () => {
    const doc = parse("Hello World\n");
    expect(findMatches(doc, "hello")).toHaveLength(1);
    expect(findMatches(doc, "hello", { caseSensitive: true })).toHaveLength(0);
  });

  it("regex کار می‌کند", () => {
    const doc = parse("ماده ۳۸ و ماده ۳۹\n");
    expect(findMatches(doc, "ماده \\d+", { regex: true })).toHaveLength(2);
  });

  it("★ regexِ نامعتبر خطا نمی‌دهد", () => {
    // کاربر وسطِ تایپِ `[a-` است — نباید چیزی بشکند.
    const doc = parse("متن\n");
    expect(() => findMatches(doc, "[a-", { regex: true })).not.toThrow();
    expect(findMatches(doc, "[a-", { regex: true })).toHaveLength(0);
  });

  it("★ regexِ با طولِ صفر حلقهٔ بی‌پایان نمی‌سازد", () => {
    const doc = parse("متن\n");
    expect(findMatches(doc, "x*", { regex: true })).toBeDefined();
  });

  it("کلمهٔ کامل — با حروفِ فارسی هم", () => {
    const doc = parse("کتاب و کتابخانه\n");
    expect(findMatches(doc, "کتاب")).toHaveLength(2);
    expect(findMatches(doc, "کتاب", { wholeWord: true })).toHaveLength(1);
  });

  it("جست‌وجوی خالی چیزی نمی‌دهد", () => {
    expect(findMatches(parse("متن\n"), "")).toHaveLength(0);
  });

  it("★ متن داخلِ کارتِ مارک هم پیدا می‌شود", () => {
    const doc = parse(":::نکته\nمتنِ داخلِ کارت\n:::\n");
    expect(findMatches(doc, "داخلِ کارت")).toHaveLength(1);
  });

  it("★ متن داخلِ جدول هم پیدا می‌شود", () => {
    const doc = parse("| الف | ب |\n| - | - |\n| هدف | مقدار |\n");
    expect(findMatches(doc, "هدف")).toHaveLength(1);
  });
});

describe("پیمایشِ تطبیق‌ها", () => {
  it("اولین تطبیق فعال می‌شود", () => {
    const state = run(makeState("یک دو یک\n"), search("یک"));
    expect(getSearchState(state).active).toBe(0);
    expect(getSearchState(state).matches).toHaveLength(2);
  });

  it("★ بعد از آخری، به اول برمی‌گردد", () => {
    let state = run(makeState("یک دو یک\n"), search("یک"));
    state = run(state, searchNext);
    expect(getSearchState(state).active).toBe(1);
    state = run(state, searchNext);
    expect(getSearchState(state).active).toBe(0); // چرخشی
  });

  it("قبلی هم چرخشی است", () => {
    let state = run(makeState("یک دو یک\n"), search("یک"));
    state = run(state, searchPrev);
    expect(getSearchState(state).active).toBe(1);
  });

  it("پاک‌کردن، همه‌چیز را صفر می‌کند", () => {
    let state = run(makeState("یک\n"), search("یک"));
    state = run(state, clearSearch);
    expect(getSearchState(state).matches).toHaveLength(0);
    expect(getSearchState(state).query).toBe("");
  });

  it("دکوریشن برای هر تطبیق ساخته می‌شود", () => {
    const state = run(makeState("یک دو یک\n"), search("یک"));
    expect(getSearchState(state).decorations.find()).toHaveLength(2);
  });
});

describe("جایگزینی", () => {
  it("تطبیقِ فعال جایگزین می‌شود", () => {
    let state = run(makeState("یک دو یک\n"), search("یک"));
    state = run(state, replaceActive("سه"));
    expect(serialize(state.doc)).toBe("سه دو یک\n");
  });

  it("★ جایگزینیِ همه — همه با هم", () => {
    let state = run(makeState("یک دو یک سه یک\n"), search("یک"));
    state = run(state, replaceAll("X"));
    expect(serialize(state.doc)).toBe("X دو X سه X\n");
  });

  it("★★ جایگزینیِ همه = یک قدمِ undo، نه چند قدم", () => {
    // کاربری که ۴۰ جا را عوض کرده و پشیمان شده، نباید ۴۰ بار Ctrl+Z بزند.
    const original = "یک دو یک سه یک\n";
    let state = run(makeState(original), search("یک"));
    state = run(state, replaceAll("X"));
    expect(serialize(state.doc)).toBe("X دو X سه X\n");

    undo(state, (tr) => (state = state.apply(tr)));
    expect(serialize(state.doc)).toBe(original);
  });

  it("جایگزینی با متنِ فارسیِ متفاوت‌طول", () => {
    let state = run(makeState("ماده ۳۸ معتبر\n"), search("۳۸"));
    state = run(state, replaceActive("۱۲۳"));
    expect(serialize(state.doc)).toBe("ماده ۱۲۳ معتبر\n");
  });

  it("بی تطبیق، جایگزینی کاری نمی‌کند", () => {
    const state = run(makeState("متن\n"), search("چیزِ‌ناموجود"));
    expect(replaceAll("X")(state, undefined)).toBe(false);
  });

  it("★ بعد از جایگزینی، تطبیق‌ها دوباره حساب می‌شوند", () => {
    let state = run(makeState("یک یک یک\n"), search("یک"));
    expect(getSearchState(state).matches).toHaveLength(3);
    state = run(state, replaceActive("دو"));
    expect(getSearchState(state).matches).toHaveLength(2);
  });
});

describe("جست‌وجو و تاشدن — با هم", () => {
  it("★ تطبیقِ داخلِ بخشِ بسته پیدا می‌شود", () => {
    // جست‌وجو روی **سند** است نه DOM، پس تاشدگی پنهانش نمی‌کند.
    const md = "# فصل\n\nمتنِ پنهان با کلمهٔ هدف\n\n# فصلِ دو\n\nبیرون\n";
    const state = EditorState.create({
      doc: parse(md),
      schema,
      plugins: [foldPlugin({ initial: ["فصل"] }), searchPlugin()],
    });
    expect(findMatches(state.doc, "هدف")).toHaveLength(1);
  });

  it("★ رفتن به تطبیقِ داخلِ بخشِ بسته، آن را باز می‌کند", () => {
    const md = "# فصل\n\nمتنِ پنهان با کلمهٔ هدف\n\n# فصلِ دو\n\nبیرون\n";
    let state = EditorState.create({
      doc: parse(md),
      schema,
      plugins: [foldPlugin({ initial: ["فصل"] }), searchPlugin()],
    });

    // مکان‌نما بیرون است → بخش بسته و چیزی پنهان شده
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 2)),
    );
    expect(foldKey.getState(state)!.decorations.find().length).toBeGreaterThan(0);

    // حالا مکان‌نما را روی تطبیق بگذار — همان کاری که پنلِ جست‌وجو می‌کند
    const match = findMatches(state.doc, "هدف")[0]!;
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, match.from, match.to)),
    );

    // بخش هنوز در فهرستِ بسته‌هاست، ولی محتوایش پنهان نیست
    expect(foldKey.getState(state)!.folded.has("فصل")).toBe(true);
    expect(foldKey.getState(state)!.decorations.find()).toHaveLength(0);
  });
});
