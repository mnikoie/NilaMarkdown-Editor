import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { schema } from "../../src/core/schema/index.js";
import { parse } from "../../src/core/markdown/parse.js";
import { serialize } from "../../src/core/markdown/serialize.js";
import {
  writingModesPlugin,
  writingModesKey,
  toggleFocusMode,
  toggleTypewriterMode,
  getWritingModes,
} from "../../src/core/plugins/writing-modes.js";

const MD = "پاراگرافِ یک\n\nپاراگرافِ دو\n\nپاراگرافِ سه\n";

function makeState(md = MD, options = {}) {
  return EditorState.create({
    doc: parse(md),
    schema,
    plugins: [writingModesPlugin(options)],
  });
}

function run(state: EditorState, cmd: typeof toggleFocusMode): EditorState {
  let next = state;
  cmd(state, (tr) => (next = state.apply(tr)));
  return next;
}

/** مکان‌نما را به بلوکِ شمارهٔ `index` می‌برد. */
function toBlock(state: EditorState, index: number): EditorState {
  let pos = 0;
  let found = -1;
  state.doc.forEach((node, offset, i) => {
    if (i === index) found = offset + 1;
    pos += node.nodeSize;
  });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, found)));
}

describe("حالتِ تمرکز", () => {
  it("پیش‌فرض خاموش است", () => {
    const state = makeState();
    expect(getWritingModes(state).focus).toBe(false);
    expect(getWritingModes(state).decorations.find()).toHaveLength(0);
  });

  it("★ روشن که شد، بقیهٔ بلوک‌ها کم‌رنگ می‌شوند", () => {
    let state = toBlock(makeState(), 0);
    state = run(state, toggleFocusMode);

    expect(getWritingModes(state).focus).toBe(true);
    // ۳ بلوک داریم، بلوکِ فعال کم‌رنگ نمی‌شود → ۲ دکوریشن
    expect(getWritingModes(state).decorations.find()).toHaveLength(2);
  });

  it("★ با حرکتِ مکان‌نما، بلوکِ روشن عوض می‌شود", () => {
    let state = run(toBlock(makeState(), 0), toggleFocusMode);
    const firstDecos = getWritingModes(state).decorations.find().map((d) => d.from);

    state = toBlock(state, 2);
    const thirdDecos = getWritingModes(state).decorations.find().map((d) => d.from);

    expect(thirdDecos).not.toEqual(firstDecos);
    expect(thirdDecos).toHaveLength(2);
  });

  it("خاموش که شد، دکوریشن‌ها می‌روند", () => {
    let state = run(toBlock(makeState(), 0), toggleFocusMode);
    expect(getWritingModes(state).decorations.find().length).toBeGreaterThan(0);
    state = run(state, toggleFocusMode);
    expect(getWritingModes(state).decorations.find()).toHaveLength(0);
  });

  it("سندِ تک‌بلوکی، چیزی کم‌رنگ نمی‌کند", () => {
    const state = run(makeState("فقط یک بلوک\n"), toggleFocusMode);
    expect(getWritingModes(state).decorations.find()).toHaveLength(0);
  });

  it("★ حالتِ تمرکز سند را عوض نمی‌کند", () => {
    // مثلِ تاشدن — فقط نمایش است.
    let state = toBlock(makeState(), 1);
    const before = serialize(state.doc);
    state = run(state, toggleFocusMode);
    expect(serialize(state.doc)).toBe(before);
    expect(serialize(state.doc)).toBe(MD);
  });

  it("★ روشن/خاموش‌کردن قدمِ undo نمی‌سازد", () => {
    const state = toBlock(makeState(), 0);
    let changed = false;
    toggleFocusMode(state, (tr) => {
      changed = tr.docChanged;
    });
    expect(changed).toBe(false);
  });

  it("گزینهٔ آغازین اعمال می‌شود", () => {
    const state = makeState(MD, { focus: true });
    expect(getWritingModes(state).focus).toBe(true);
  });

  it("★ کلاسِ حالت روی ادیتور گذاشته می‌شود", () => {
    // CSS به همین کلاس‌ها تکیه می‌کند، پس باید واقعاً تولید شوند.
    const focused = makeState(MD, { focus: true });
    const plugin = focused.plugins.find((p) => p.spec.key === writingModesKey)!;
    const attrs = plugin.props.attributes as
      | ((s: EditorState) => Record<string, string>)
      | undefined;

    expect(attrs?.(focused).class).toContain("tm-focus-mode");

    const both = makeState(MD, { focus: true, typewriter: true });
    expect(attrs?.(both).class).toContain("tm-typewriter-mode");

    const neither = makeState(MD);
    expect(attrs?.(neither).class).toBeUndefined();
  });
});

describe("حالتِ ماشین‌تحریر", () => {
  it("پیش‌فرض خاموش است", () => {
    expect(getWritingModes(makeState()).typewriter).toBe(false);
  });

  it("روشن و خاموش می‌شود", () => {
    let state = run(makeState(), toggleTypewriterMode);
    expect(getWritingModes(state).typewriter).toBe(true);
    state = run(state, toggleTypewriterMode);
    expect(getWritingModes(state).typewriter).toBe(false);
  });

  it("★ سند را عوض نمی‌کند", () => {
    const state = run(makeState(), toggleTypewriterMode);
    expect(serialize(state.doc)).toBe(MD);
  });

  it("دو حالت مستقل‌اند", () => {
    let state = run(makeState(), toggleFocusMode);
    state = run(state, toggleTypewriterMode);
    expect(getWritingModes(state).focus).toBe(true);
    expect(getWritingModes(state).typewriter).toBe(true);

    state = run(state, toggleFocusMode);
    expect(getWritingModes(state).focus).toBe(false);
    expect(getWritingModes(state).typewriter).toBe(true); // دست‌نخورده
  });

  it("گزینهٔ آغازین اعمال می‌شود", () => {
    expect(getWritingModes(makeState(MD, { typewriter: true })).typewriter).toBe(true);
  });
});
