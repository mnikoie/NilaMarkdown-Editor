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

  it("★★ عنوانِ بی‌لنگر والدِ فصل‌های نام‌دارِ بی‌لنگرِ فایل واقعی هم هست", () => {
    const doc = parse(
      "# بخشنامه تنقیح و تلخیص اجرائیات\n\nمقدمه\n\n# فصل اول\n\nمتن یک\n\n# فصل دوم\n\nمتن دو\n",
    );
    const tree = buildOutline(doc);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.level).toBe(0);
    expect(tree[0]!.children.map((node) => node.title)).toEqual(["فصل اول", "فصل دوم"]);
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

  describe("فهرستِ سطحِ بالا", () => {
    it("★★ هر آیتمِ فهرستِ شماره‌دارِ سطحِ بالا با شمارهٔ واقعی‌اش گره می‌گیرد", () => {
      const md = "# فصل سوم\n\n1. ابلاغ اجرائیه\n2. مهلت پرداخت\n3. بازداشت پس از مهلت\n";
      const tree = buildOutline(parse(md));
      expect(shape(tree)).toEqual([
        {
          kind: "heading",
          title: "فصل سوم",
          children: [
            { kind: "ordered_list", title: "۱. ابلاغ اجرائیه", children: [] },
            { kind: "ordered_list", title: "۲. مهلت پرداخت", children: [] },
            { kind: "ordered_list", title: "۳. بازداشت پس از مهلت", children: [] },
          ],
        },
      ]);
    });

    it("شمارهٔ فهرست از start شروع می‌شود، نه همیشه از ۱", () => {
      const md = "5. پنجم\n6. ششم\n";
      const tree = buildOutline(parse(md));
      expect(tree.map((n) => n.title)).toEqual(["۵. پنجم", "۶. ششم"]);
    });

    it("فهرستِ نقطه‌ای بدونِ شماره، فقط با متنِ آیتم گره می‌گیرد", () => {
      const md = "- الف\n- ب\n";
      const tree = buildOutline(parse(md));
      expect(tree.map((n) => ({ kind: n.kind, title: n.title }))).toEqual([
        { kind: "bullet_list", title: "الف" },
        { kind: "bullet_list", title: "ب" },
      ]);
    });

    it("★★ فهرستِ تودرتوی داخلِ یک آیتم، خودش گره نمی‌گیرد", () => {
      const md = "1. آیتمِ اول\n   - زیرِ اول\n   - زیرِ دوم\n2. آیتمِ دوم\n";
      const tree = buildOutline(parse(md));
      // فقط دو آیتمِ سطحِ بالا؛ دو زیرآیتمِ تودرتو در درخت نیستند.
      expect(tree).toHaveLength(2);
      expect(tree[0]!.title).toBe("۱. آیتمِ اول");
      expect(tree[0]!.children).toEqual([]);
      expect(tree[1]!.title).toBe("۲. آیتمِ دوم");
    });

    it("foldable همیشه false است — آیتمِ فهرست هیچ‌وقت فلش نمی‌گیرد", () => {
      const md = "1. آیتمی با **متنِ بلندتر** و چند کلمهٔ دیگر\n";
      const [node] = buildOutline(parse(md));
      expect(node!.foldable).toBe(false);
    });

    it("from/to روی خودِ list_item است — ناوبری به همان بند می‌رود", () => {
      const md = "# فصل\n\n1. اول\n2. دوم\n";
      const doc = parse(md);
      const tree = buildOutline(doc);
      const second = tree[0]!.children[1]!;
      const resolved = doc.nodeAt(second.from);
      expect(resolved?.type.name).toBe("list_item");
      expect(resolved?.textContent).toContain("دوم");
    });

    it("★★ روی سندِ واقع‌گرا (فصلِ اول با فهرست، فصلِ دوم با فهرستِ دیگر)، همهٔ آیتم‌ها به خودشان اشاره می‌کنند، نه به فصلِ بعدی", () => {
      // این دقیقاً همان الگویی است که در عمل باگ داد: با محاسبهٔ
      // دستیِ اشتباهِ offset، کلیک روی آیتمِ N به فصلِ بعدی می‌پرید.
      const md =
        "# فصل اول\n\n" +
        "1. بند یک\n2. بند دو\n3. بند سه\n4. بند چهار\n5. بند پنج\n" +
        "6. بند شش\n7. بند هفت\n8. بند هشت\n9. بند نه\n10. بند ده\n\n" +
        "# فصل دوم\n\nمتنِ فصلِ دوم\n";
      const doc = parse(md);
      const tree = buildOutline(doc);
      const chapterOne = tree[0]!;
      const chapterTwo = tree[1]!;
      expect(chapterOne.title).toBe("فصل اول");
      expect(chapterTwo.title).toBe("فصل دوم");
      expect(chapterOne.children).toHaveLength(10);

      // هر آیتم باید در بازهٔ [from, to) خودِ فصلِ اول باشد، نه در
      // بازهٔ فصلِ دوم — این دقیقاً چیزی است که drift جابه‌جا می‌کرد.
      for (const item of chapterOne.children) {
        expect(item.from).toBeGreaterThanOrEqual(chapterOne.from);
        expect(item.to).toBeLessThanOrEqual(chapterTwo.from);
        const resolved = doc.nodeAt(item.from);
        expect(resolved?.type.name).toBe("list_item");
      }

      // متنِ هرکدام باید با شمارهٔ خودش مطابق باشد — «بند شش» فقط در
      // آیتمِ ششم پیدا شود، نه در جای دیگر.
      const sixth = chapterOne.children[5]!;
      expect(sixth.title).toContain("بند شش");
      const resolvedSixth = doc.nodeAt(sixth.from);
      expect(resolvedSixth?.textContent).toContain("بند شش");
      expect(resolvedSixth?.textContent).not.toContain("بند هفت");
    });

    it("آیتم‌های عنوانِ تکراری، لنگرِ یکتا می‌گیرند", () => {
      const md = "1. مورد\n2. مورد\n";
      const ids = buildOutline(parse(md)).map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
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
