import { describe, it, expect } from "vitest";
import { parse } from "../../src/core/markdown/parse.js";
import { buildOutline, flattenOutline, nodeAt } from "../../src/core/outline/build.js";
import { slugify, makeUnique } from "../../src/core/outline/slug.js";

const shape = (nodes: ReturnType<typeof buildOutline>): unknown =>
  nodes.map((n) => ({ kind: n.kind, title: n.title, children: shape(n.children) }));

describe("درختِ ساختار", () => {
  it("سرفصل‌ها تودرتو می‌شوند", () => {
    const doc = parse("# یک\n\n## یک-الف\n\n### یک-الف-۱\n\n## یک-ب\n\n# دو\n");
    expect(shape(buildOutline(doc))).toEqual([
      {
        kind: "heading",
        title: "یک",
        children: [
          { kind: "heading", title: "یک-الف", children: [{ kind: "heading", title: "یک-الف-۱", children: [] }] },
          { kind: "heading", title: "یک-ب", children: [] },
        ],
      },
      { kind: "heading", title: "دو", children: [] },
    ]);
  });

  it("ماده و تبصره زیرِ فصل می‌نشینند", () => {
    const md =
      "# فصل چهارم\n\n" +
      "::::ماده{شماره=۵۰}\nمتن\n\n:::تبصره{شماره=۱}\nمتنِ تبصره\n:::\n::::\n";
    expect(shape(buildOutline(parse(md)))).toEqual([
      {
        kind: "heading",
        title: "فصل چهارم",
        children: [
          {
            kind: "ماده",
            title: "ماده ۵۰",
            children: [{ kind: "تبصره", title: "تبصره ۱", children: [] }],
          },
        ],
      },
    ]);
  });

  it("پرشِ سطح، درخت را خراب نمی‌کند (h1 سپس h4)", () => {
    const doc = parse("# یک\n\n#### چهار\n\n## دو\n");
    expect(shape(buildOutline(doc))).toEqual([
      {
        kind: "heading",
        title: "یک",
        children: [
          { kind: "heading", title: "چهار", children: [] },
          { kind: "heading", title: "دو", children: [] },
        ],
      },
    ]);
  });

  it("★★ عنوانِ بی‌لنگرِ ابتدای سند، والدِ فصل‌های لنگردار است", () => {
    const doc = parse(
      "# عنوان بخشنامه\n\nمقدمه\n\n# فصل اول {#فصل-۱}\n\nمتن یک\n\n# فصل دوم {#فصل-۲}\n\nمتن دو\n",
    );
    const tree = buildOutline(doc);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.title).toBe("عنوان بخشنامه");
    expect(tree[0]!.level).toBe(0);
    expect(tree[0]!.children.map((node) => node.id)).toEqual(["فصل-۱", "فصل-۲"]);
  });

  it("عنوانِ بی‌فرزندِ ساختاری ولی دارای متن، از Outline قابلِ تاشدن است", () => {
    const [node] = buildOutline(parse("# فصل\n\nیک پاراگراف\n"));
    expect(node!.children).toEqual([]);
    expect(node!.foldable).toBe(true);
  });

  it("مارکِ غیرساختاری در درخت نمی‌آید", () => {
    // «نکته» anchor ندارد — یادداشتِ نویسنده است، نه گرهِ ساختار.
    const doc = parse("# یک\n\n:::نکته\nمتن\n:::\n");
    expect(shape(buildOutline(doc))).toEqual([
      { kind: "heading", title: "یک", children: [] },
    ]);
  });

  it("وضعیت و شماره خوانده می‌شوند", () => {
    const doc = parse(":::ماده{شماره=۳۸ وضعیت=منسوخ}\nمتن\n:::\n");
    const [node] = buildOutline(doc);
    expect(node!.number).toBe("۳۸");
    expect(node!.status).toBe("منسوخ");
  });

  it("سندِ خالی درختِ خالی می‌دهد، نه خطا", () => {
    expect(buildOutline(parse(""))).toEqual([]);
    expect(buildOutline(parse("فقط یک پاراگراف\n"))).toEqual([]);
  });

  it("عنوانِ تکراری، لنگرِ تکراری نمی‌سازد", () => {
    const doc = parse(":::تبصره\nالف\n:::\n\n:::تبصره\nب\n:::\n");
    const ids = buildOutline(doc).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("لنگرِ صریحِ سرفصل حفظ می‌شود", () => {
    const doc = parse("# فصل چهارم\n");
    const [node] = buildOutline(doc);
    expect(node!.id).toBe("فصل-چهارم");
  });

  it("nodeAt عمیق‌ترین گرهِ دربرگیرنده را می‌دهد", () => {
    const md = "# فصل\n\n::::ماده{شماره=۵۰}\nمتن\n::::\n";
    const doc = parse(md);
    const tree = buildOutline(doc);
    const madde = flattenOutline(tree).find((n) => n.kind === "ماده")!;
    expect(nodeAt(tree, madde.from + 1)!.kind).toBe("ماده");
  });
});

describe("لنگر", () => {
  it("حروفِ فارسی می‌مانند", () => {
    expect(slugify("فصل چهارم")).toBe("فصل-چهارم");
  });

  it("نیم‌فاصله به خطِ تیره تبدیل می‌شود، نه حذف", () => {
    // «میشود» کلمهٔ دیگری است — حذفِ نیم‌فاصله لنگر را غلط می‌کند.
    expect(slugify("می‌شود")).toBe("می-شود");
  });

  it("ارقامِ فارسی به انگلیسی نگاشت می‌شوند", () => {
    expect(slugify("ماده ۵۰")).toBe("ماده-50");
  });

  it("حرفِ عربی و فارسی یک لنگر می‌گیرند", () => {
    expect(slugify("كتاب")).toBe(slugify("کتاب"));
  });

  it("عنوانِ خالی هم لنگر می‌گیرد", () => {
    expect(slugify("")).toBe("بخش-1");
    expect(slugify("###")).toBe("بخش-1");
  });

  it("یکتاسازی", () => {
    const seen = new Map<string, number>();
    expect(makeUnique("تبصره", seen)).toBe("تبصره");
    expect(makeUnique("تبصره", seen)).toBe("تبصره-2");
    expect(makeUnique("تبصره", seen)).toBe("تبصره-3");
  });
});
