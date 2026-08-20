import { describe, it, expect } from "vitest";
import { parse } from "../../src/core/markdown/parse.js";
import { serialize } from "../../src/core/markdown/serialize.js";
import { buildOutline } from "../../src/core/outline/build.js";

/** یک سندِ شبیهِ بخشنامهٔ واقعی — با ساختارِ فصل/ماده/تبصره/بند. */
const SANAD = `---
شناسه: "62285360"
عنوان: بخشنامه نحوه ارزیابی
---

# فصل اول: کلیات {#fasl-1}

این بخشنامه در اجرای :ref[ماده ۵۰ قانون تأمین اجتماعی]{هدف=قانون-تامین#ماده-50} ابلاغ می‌شود.

:::نکته{نویسنده=دفترِ فنی}
این بند در بازبینی ۱۴۰۴ اضافه شد.
:::

# فصل دوم: نحوه محاسبه {#fasl-2}

::::ماده{شماره=۳۸ وضعیت=معتبر تاریخ=۱۳۵۵/۱۰/۲۵}
کارفرما مکلف است **حق بیمه** را پرداخت کند.

:::تبصره{شماره=۱}
در صورت تأخیر، جریمه تعلق می‌گیرد.
:::

:::تبصره{شماره=۲}
موارد استثنا در آیین‌نامه می‌آید.
:::
::::

:::ماده{شماره=۳۹ وضعیت=منسوخ}
این ماده با بخشنامه بعدی جایگزین شد.
:::
`;

describe("سندِ واقعی‌نما", () => {
  it("رفت‌وبرگشت بی‌تغییر", () => {
    expect(serialize(parse(SANAD))).toBe(SANAD);
  });

  it("درختِ کامل درست ساخته می‌شود", () => {
    const tree = buildOutline(parse(SANAD));
    const shape = (n: ReturnType<typeof buildOutline>): unknown =>
      n.map((x) => ({ t: x.title, c: shape(x.children) }));
    expect(shape(tree)).toEqual([
      { t: "فصل اول: کلیات", c: [] },
      {
        t: "فصل دوم: نحوه محاسبه",
        c: [
          { t: "ماده ۳۸", c: [{ t: "تبصره ۱", c: [] }, { t: "تبصره ۲", c: [] }] },
          { t: "ماده ۳۹", c: [] },
        ],
      },
    ]);
  });

  it("لنگرِ صریح بر لنگرِ خودکار مقدم است", () => {
    // `{#fasl-1}` که کاربر نوشته باید همان بماند — ارجاع‌های واردشونده به
    // آن اشاره می‌کنند. اگر از عنوان لنگر بسازیم، با هر ویرایشِ عنوان
    // همهٔ ارجاع‌ها می‌شکنند.
    const tree = buildOutline(parse(SANAD));
    expect(tree.map((n) => n.id)).toEqual(["fasl-1", "fasl-2"]);
  });

  it("لنگر از عنوان جدا می‌شود و در متن نمی‌ماند", () => {
    const tree = buildOutline(parse(SANAD));
    expect(tree[0]!.title).toBe("فصل اول: کلیات");
    expect(tree[0]!.title).not.toContain("{#");
  });

  it("وضعیتِ منسوخ خوانده می‌شود", () => {
    const tree = buildOutline(parse(SANAD));
    const m39 = tree[1]!.children[1]!;
    expect(m39.status).toBe("منسوخ");
    expect(m39.number).toBe("۳۹");
  });

  it("«نکته» در درخت نمی‌آید ولی در سند می‌ماند", () => {
    const tree = buildOutline(parse(SANAD));
    expect(JSON.stringify(tree)).not.toContain("نکته");
    expect(serialize(parse(SANAD))).toContain(":::نکته{نویسنده=دفترِ فنی}");
  });

  it("ویرایش، بقیهٔ سند را دست‌نخورده می‌گذارد", () => {
    // شبیه‌سازیِ «کاربر یک حرف عوض کرد»
    const edited = SANAD.replace("حق بیمه", "حقِ بیمه");
    const out = serialize(parse(edited));
    expect(out).toBe(edited);
    // فقط همان یک جا فرق دارد
    const diff = out.split("\n").filter((l, i) => l !== SANAD.split("\n")[i]);
    expect(diff.length).toBe(1);
  });
});
