import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { parse } from "../../src/core/markdown/parse.js";
import { serialize } from "../../src/core/markdown/serialize.js";
import { schema } from "../../src/core/schema/index.js";
import { foldPlugin, foldKey, toggleFold, foldAll, unfoldAll, isFolded } from "../../src/core/plugins/fold.js";
import { buildOutline, flattenOutline } from "../../src/core/outline/build.js";

const MD =
  "# فصل یک\n\nمتنِ یک\n\n## بخشِ الف\n\nمتنِ الف\n\n# فصل دو\n\nمتنِ دو\n";

function makeState(md = MD, initial: string[] = []) {
  return EditorState.create({
    doc: parse(md),
    schema,
    plugins: [foldPlugin({ initial })],
  });
}

/**
 * فقط تزئیناتی که واقعاً چیزی را **پنهان** می‌کنند.
 *
 * ★ چرا شمردنِ کلِ تزئینات غلط است: از وقتی مثلثِ تاشدن کنارِ هر سرفصل
 * اضافه شد، سندِ کاملاً بازِ هم چند تزئین دارد (دکمه‌ها و حالتِ
 * `data-folded`). «صفر تزئین» دیگر معنیِ «چیزی پنهان نیست» نمی‌دهد.
 */
function hiddenCount(state: EditorState): number {
  const set = foldKey.getState(state)!.decorations;
  return set
    .find()
    .filter((d) => {
      const spec = (d as unknown as { type?: { attrs?: Record<string, string> } }).type;
      return spec?.attrs?.class === "tm-folded-hidden";
    }).length;
}

describe("تاشدن", () => {
  it("در آغاز چیزی بسته نیست", () => {
    const state = makeState();
    expect(foldKey.getState(state)!.folded.size).toBe(0);
    expect(hiddenCount(state)).toBe(0);
  });

  it("toggle یک بخش را می‌بندد و باز می‌کند", () => {
    let state = makeState();
    const id = buildOutline(state.doc)[0]!.id;

    toggleFold(id)(state, (tr) => (state = state.apply(tr)));
    expect(isFolded(state, id)).toBe(true);
    expect(foldKey.getState(state)!.decorations.find().length).toBeGreaterThan(0);

    toggleFold(id)(state, (tr) => (state = state.apply(tr)));
    expect(isFolded(state, id)).toBe(false);
  });

  it("★ تاشدگی سند را عوض نمی‌کند — مارک‌داون همان می‌ماند", () => {
    let state = makeState();
    const before = serialize(state.doc);
    const id = buildOutline(state.doc)[0]!.id;

    toggleFold(id)(state, (tr) => (state = state.apply(tr)));

    expect(serialize(state.doc)).toBe(before);
    expect(serialize(state.doc)).toBe(MD);
  });

  it("★ تاشدن در تاریخچهٔ undo نمی‌آید", () => {
    let state = makeState();
    const id = buildOutline(state.doc)[0]!.id;
    let captured = false;
    toggleFold(id)(state, (tr) => {
      captured = tr.docChanged;
      state = state.apply(tr);
    });
    // تراکنشی که سند را عوض نکند، قدمِ undo نمی‌سازد.
    expect(captured).toBe(false);
  });

  it("★ اگر مکان‌نما داخلِ بخشِ بسته برود، باز می‌شود", () => {
    let state = makeState();
    const tree = buildOutline(state.doc);
    const id = tree[0]!.id;

    toggleFold(id)(state, (tr) => (state = state.apply(tr)));
    expect(foldKey.getState(state)!.decorations.find().length).toBeGreaterThan(0);

    // مکان‌نما را داخلِ محدودهٔ پنهان ببر.
    const inside = tree[0]!.to + 2;
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, inside)),
    );

    // هنوز در فهرستِ بسته‌هاست، ولی چیزی پنهان نمی‌شود.
    expect(isFolded(state, id)).toBe(true);
    expect(hiddenCount(state)).toBe(0);
  });

  it("foldAll همه را می‌بندد و unfoldAll باز می‌کند", () => {
    let state = makeState();
    const count = flattenOutline(buildOutline(state.doc)).length;

    foldAll()(state, (tr) => (state = state.apply(tr)));
    expect(foldKey.getState(state)!.folded.size).toBe(count);

    unfoldAll()(state, (tr) => (state = state.apply(tr)));
    expect(foldKey.getState(state)!.folded.size).toBe(0);
  });

  it("foldAll با عمق، فقط سطحِ عمیق‌تر را می‌بندد", () => {
    let state = makeState();
    foldAll(2)(state, (tr) => (state = state.apply(tr)));
    const folded = foldKey.getState(state)!.folded;
    const flat = flattenOutline(buildOutline(state.doc));
    for (const n of flat) {
      expect(folded.has(n.id)).toBe(n.level >= 2);
    }
  });

  it("★ شمارشِ خلاصه، بلوکِ تودرتو را چندبار نمی‌شمارد", () => {
    // بخشِ «فصل» شاملِ یک پاراگراف و یک کارت است (کارت خودش دو پاراگرافِ
    // تودرتو دارد). پنهان‌شده‌ها ۲ بلوکِ سطحِ اول‌اند — نه ۴ یا ۵ که با
    // شمارشِ تودرتو در می‌آمد. خودِ سرفصل پنهان نمی‌شود.
    const md =
      "# فصل\n\nیک\n\n:::نکته\nدو\n\nسه\n:::\n\n# فصلِ بعد\n\nبیرون\n";
    let state = makeState(md);
    // مکان‌نما بیرونِ بخشِ اول تا خودکار باز نشود
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, state.doc.content.size - 2)),
    );
    toggleFold("فصل")(state, (tr) => (state = state.apply(tr)));

    const widget = foldKey
      .getState(state)!
      .decorations.find()
      .find((d) => (d.spec as { key?: string }).key?.startsWith("fold-"));
    expect(widget).toBeDefined();

    const toDOM = (widget as unknown as { type: { toDOM: unknown } }).type.toDOM;
    const el = typeof toDOM === "function" ? (toDOM as () => HTMLElement)() : (toDOM as HTMLElement);
    expect(el.textContent).toBe("۲ بلوکِ پنهان");
  });

  it("لنگرِ ناموجود خطا نمی‌دهد", () => {
    let state = makeState();
    toggleFold("یک-لنگرِ-کاملاً-ناموجود")(state, (tr) => (state = state.apply(tr)));
    expect(() => foldKey.getState(state)!.decorations.find()).not.toThrow();
  });

  it("سندِ بی‌سرفصل، بی خطا کار می‌کند", () => {
    let state = makeState("فقط یک پاراگراف\n");
    foldAll()(state, (tr) => (state = state.apply(tr)));
    expect(foldKey.getState(state)!.folded.size).toBe(0);
  });

  it("حالتِ آغازینِ بسته اعمال می‌شود", () => {
    const state = makeState(MD, ["فصل-یک"]);
    expect(isFolded(state, "فصل-یک")).toBe(true);
    expect(foldKey.getState(state)!.decorations.find().length).toBeGreaterThan(0);
  });

  it("حالتِ آغازینِ all همهٔ عنوان‌ها را می‌بندد", () => {
    const state = EditorState.create({
      doc: parse(MD),
      schema,
      plugins: [foldPlugin({ initial: "all" })],
    });
    expect(foldKey.getState(state)!.folded.size).toBe(flattenOutline(buildOutline(state.doc)).length);
    const summaries = foldKey
      .getState(state)!
      .decorations.find()
      .filter((deco) => (deco.spec as { key?: string }).key?.startsWith("fold-"));
    expect(summaries).toHaveLength(2); // فقط دو فصلِ ریشه، نه خلاصهٔ بخشِ پنهانِ داخل فصل
  });

  it("در حالت آکاردئون فقط یک عنوانِ هم‌سطح باز می‌ماند", () => {
    let state = EditorState.create({
      doc: parse(MD),
      schema,
      plugins: [foldPlugin({ initial: "all", mode: "accordion" })],
    });
    const roots = buildOutline(state.doc);
    toggleFold(roots[0]!.id, roots[0]!.from)(state, (tr) => (state = state.apply(tr)));
    expect(isFolded(state, roots[0]!.id)).toBe(false);
    toggleFold(roots[1]!.id, roots[1]!.from)(state, (tr) => (state = state.apply(tr)));
    expect(isFolded(state, roots[0]!.id)).toBe(true);
    expect(isFolded(state, roots[1]!.id)).toBe(false);
  });

  it("بستنِ بخشی که مکان‌نما داخلش است، مکان‌نما را به عنوان منتقل می‌کند", () => {
    let state = makeState();
    const node = buildOutline(state.doc)[0]!;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, node.from + 3)));
    toggleFold(node.id, node.from)(state, (tr) => (state = state.apply(tr)));
    expect(state.selection.from).toBe(node.from + 1);
    expect(hiddenCount(state)).toBeGreaterThan(0);
  });

  it("onChange با فهرستِ لنگرها صدا می‌شود — برای ذخیره", () => {
    const seen: string[][] = [];
    let state = EditorState.create({
      doc: parse(MD),
      schema,
      plugins: [foldPlugin({ onChange: (f) => seen.push(f) })],
    });
    const id = buildOutline(state.doc)[0]!.id;
    toggleFold(id)(state, (tr) => (state = state.apply(tr)));
    expect(seen).toEqual([[id]]);
  });
});
