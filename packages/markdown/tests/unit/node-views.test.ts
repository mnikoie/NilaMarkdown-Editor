import { describe, it, expect, beforeEach } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "../../src/core/schema/index.js";
import { parse } from "../../src/core/markdown/parse.js";
import { serialize } from "../../src/core/markdown/serialize.js";
import { createNodeViews } from "../../src/node-views/index.js";
import { BUILTIN_MARKS } from "../../src/core/directives/builtin.js";
import { isRealBrowser } from "../../src/node-views/CodeBlock.js";
import type { Features } from "../../src/node-views/index.js";

/**
 * NodeViewهای بلوکِ کد، ریاضی و نمودار.
 *
 * ⚠️ همهٔ تست‌های این فایل **همگام**اند.
 *
 * چرا: در Vitest 4 + jsdom، هر تستِ `async` که `EditorView` با NodeViewِ
 * دارای رنگ‌آمیزیِ نامتقارن بسازد، در مرحلهٔ collect گیر می‌کند و worker
 * را می‌کُشد (۹۰ ثانیه، `tests: 0ms`). نسخهٔ همگامِ همان تست در یک ثانیه
 * سبز می‌شود. این محدودیتِ محیطِ تست است، نه باگِ کد.
 *
 * پس اینجا فقط ساختارِ همگام سنجیده می‌شود — چیزی که NodeView بلافاصله
 * می‌سازد. نتیجهٔ نامتقارن (رنگ‌آمیزیِ Shiki، رندرِ Mermaid) در مرورگرِ
 * واقعی بررسی شده، که جای درستش هم همان‌جاست: هیچ‌کدام در jsdom اصلاً
 * بار نمی‌شوند.
 */

function makeView(md: string, features: Features = {}) {
  const mount = document.createElement("div");
  document.body.append(mount);
  return new EditorView(mount, {
    state: EditorState.create({ doc: parse(md), schema }),
    nodeViews: createNodeViews(BUILTIN_MARKS, features),
  });
}

describe("NodeViewها", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("محیطِ تست، مرورگرِ واقعی نیست — پس Shiki و Mermaid بار نمی‌شوند", () => {
    expect(isRealBrowser()).toBe(false);
  });

  it("بلوکِ کد: ساختار، برچسبِ زبان و دکمهٔ کپی", () => {
    const view = makeView("```python\nprint(1)\n```\n");
    expect(view.dom.querySelector(".tm-code")).not.toBeNull();
    expect(view.dom.querySelector(".tm-code-lang")?.textContent).toBe("python");
    expect(view.dom.querySelector(".tm-code-copy")?.textContent).toBe("کپی");
    view.destroy();
  });

  it("بلوکِ کد: متن قابلِ ویرایش می‌ماند و در خروجی سالم است", () => {
    const md = "```ts\nconst a = 1;\n```\n";
    const view = makeView(md);
    expect(view.dom.querySelector("code")?.textContent).toBe("const a = 1;");
    expect(serialize(view.state.doc)).toBe(md);
    view.destroy();
  });

  it("بلوکِ کدِ بی‌زبان، برچسبِ «متن» می‌گیرد", () => {
    const md = "```\nمتنِ ساده\n```\n";
    const view = makeView(md);
    expect(view.dom.querySelector(".tm-code-lang")?.textContent).toBe("متن");
    expect(serialize(view.state.doc)).toBe(md);
    view.destroy();
  });

  it("ریاضیِ بلوکی و درون‌خطی ساخته می‌شوند", () => {
    const view = makeView("$$\nx^2\n$$\n\nمتن $a+b$ ادامه\n");
    expect(view.dom.querySelector(".tm-math-block")).not.toBeNull();
    expect(view.dom.querySelector(".tm-math-inline")).not.toBeNull();
    view.destroy();
  });

  it("★ ریاضی در رفت‌وبرگشت گم نمی‌شود", () => {
    const md = "$$\n\frac{a}{b}\n$$\n";
    const view = makeView(md);
    expect(serialize(view.state.doc)).toBe(md);
    view.destroy();
  });

  it("★ Mermaid خاموش → کد نمایش داده می‌شود، محتوا گم نمی‌شود", () => {
    const md = "```mermaid\ngraph TD;\n  A-->B;\n```\n";
    const view = makeView(md, { mermaid: false });
    const diagram = view.dom.querySelector(".tm-mermaid");
    expect(diagram).not.toBeNull();
    expect(diagram?.getAttribute("data-rendered")).toBe("off");
    expect(diagram?.querySelector("code")?.textContent).toContain("graph TD;");
    expect(serialize(view.state.doc)).toBe(md);
    view.destroy();
  });

  it("Mermaid با گرهٔ code_block اشتباه گرفته نمی‌شود", () => {
    const view = makeView("```ts\nx\n```\n\n```mermaid\ngraph TD;\n```\n", { mermaid: true });
    expect(view.dom.querySelectorAll(".tm-code").length).toBe(1);
    expect(view.dom.querySelectorAll(".tm-mermaid").length).toBe(1);
    view.destroy();
  });

  it("★ خاموش‌کردنِ features، سند را خراب نمی‌کند", () => {
    const md = "$$\nx^2\n$$\n\n```ts\nconst a = 1;\n```\n";
    const view = makeView(md, { math: false, highlight: false, mermaid: false });
    expect(serialize(view.state.doc)).toBe(md);
    view.destroy();
  });

  it("سندِ مخلوط با همهٔ انواع، بی خطا رندر می‌شود", () => {
    const md =
      "# عنوان\n\n```ts\nconst a = 1;\n```\n\n$$\nx^2\n$$\n\n" +
      "```mermaid\ngraph TD;\n  A-->B;\n```\n\n:::نکته\nمتن\n:::\n";
    const view = makeView(md, { math: true, mermaid: true, highlight: true });
    expect(view.dom.querySelector(".tm-code")).not.toBeNull();
    expect(view.dom.querySelector(".tm-math-block")).not.toBeNull();
    expect(view.dom.querySelector(".tm-mermaid")).not.toBeNull();
    expect(view.dom.querySelector(".tm-mark")).not.toBeNull();
    expect(serialize(view.state.doc)).toBe(md);
    view.destroy();
  });
});
