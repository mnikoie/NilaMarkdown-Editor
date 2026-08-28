import { describe, it, expect } from "vitest";
import { parse } from "../../src/core/markdown/parse.js";
import { serialize } from "../../src/core/markdown/serialize.js";

/**
 * کاربر فایلش را باز می‌کند، یک حرف عوض می‌کند، ذخیره می‌کند — و اگر این
 * شرط برقرار نباشد، diff پر می‌شود از تغییرهایی که او نداده.
 */

const fixtures: Record<string, string> = {
  پاراگرافِ_ساده: "سلام دنیا\n",

  تأکید: "این **پررنگ** و این *کج* است.\n",

  تأکیدِ_زیرخطی: "این __پررنگ__ و این _کج_ است.\n",

  کدِ_درون‌خطی: "دستورِ `pnpm install` را بزن.\n",

  عنوان: "# عنوانِ یک\n\n## عنوانِ دو\n",

  عنوانِ_Setext: "عنوانِ یک\n==========\n\nعنوانِ دو\n----------\n",

  عنوانِ_با_لنگر: "# فصل چهارم: نحوه ارزیابی {#fasl-4}\n",

  // `{#x}` وسطِ جمله لنگر نیست، متنِ عادی است و نباید جدا شود.
  آکولادِ_وسطِ_عنوان: "# متنِ {#x} وسطِ عنوان\n",

  لینک: "به [سایت](https://example.com) برو.\n",

  فهرستِ_نقطه‌ای: "- یک\n- دو\n- سه\n",

  فهرستِ_شماره‌دار: "1. یک\n2. دو\n",

  فهرستِ_شماره‌دار_پرانتزی: "1) یک\n2) دو\n",

  چک‌لیست: "* [ ] نکرده\n* [x] کرده\n",

  نقلِ_قول: "> نقلِ قول\n",

  بلوکِ_کد: "```ts\nconst a = 1;\n```\n",

  بلوکِ_کد_با_تیلدا: "~~~~ts\nconst ticks = ```;\n~~~~\n",

  شکستِ_سخت_با_فاصله: "خط اول  \nخط دوم\n",

  شکستِ_سخت_با_بک‌اسلش: "خط اول\\\nخط دوم\n",

  جداکننده: "---\n",

  تودرتو: "> - یک\n>\n>   > تودرتو\n",

  // ★ directiveها — بندِ ۱۸
  directiveِ_بلوکی: ":::note\nمحتوا\n:::\n",

  directiveِ_با_صفت: ":::note{نوع=compiler}\nمحتوا\n:::\n",

  directiveِ_فارسی: ":::نکته{نوع=مؤلف}\nمحتوای فارسی\n:::\n",

  directiveِ_درون‌خطی: "این :ref[متنِ نمایشی]{هدف=قانون-تامین#ماده-۵۰} است.\n",

  directiveِ_برگی: "::hr{نوع=دوتایی}\n",

  directiveِ_ناشناخته: ":::یک‌چیزِ‌کاملاً‌ناشناخته{الف=ب}\nمحتوا\n:::\n",

  // ★ مقدارِ دارای فاصله **باید** گیومه داشته باشد — قاعدهٔ خودِ directive
  // است: فاصله پایانِ مقدار است. `preferUnquoted` نباید این گیومه‌ها را
  // بردارد، وگرنه `{نویسنده="دفترِ فنی"}` به دو صفتِ غلط تبدیل می‌شود.
  صفتِ_با_فاصله: ':::نکته{نویسنده="دفترِ فنی"}\nمتن\n:::\n',

  صفتِ_مخلوط: ':::ماده{شماره=۵۰ عنوان="نحوه ارزیابی"}\nمتن\n:::\n',

  // حصارِ بیرونی باید بلندتر از داخلی باشد (`::::` روی `:::`) — این قاعدهٔ
  // خودِ CommonMark است. با `:::`ِ هم‌طول، حصارِ بستنِ اول به داخلی نسبت
  // داده می‌شود و `:::`ِ آخر یک پاراگرافِ سرگردان می‌ماند.
  ماده_و_تبصره:
    "::::ماده{شماره=۵۰ وضعیت=معتبر}\nمتنِ ماده\n\n:::تبصره{شماره=۱}\nمتنِ تبصره\n:::\n::::\n",

  // فارسی و لبه‌های یونیکد
  فارسیِ_ساده: "این یک متنِ فارسی است.\n",

  نیم‌فاصله: "می‌شود و نمی‌خواهم و بچه‌ها\n",

  مخلوطِ_فارسی_انگلیسی: "متنِ فارسی با word انگلیسی و ۱۲۳ و 456.\n",

  ایموجی: "سلام 👋🏽 دنیا 🇮🇷\n",

  خارج_از_BMP: "𝕋𝕖𝕤𝕥 𝓮𝓶𝓸𝓳𝓲 😀\n",

  front_matter: "---\nعنوان: تست\n---\n\nمحتوا\n",

  html_خام: "<div class=\"x\">محتوا</div>\n",

  html_درون_خطی: "متنِ <span class=\"x\">آزمایشی</span> عادی\n",

  entity_نام‌دار: "حق نشر &copy; و فاصله&nbsp;حفظ می‌شود.\n",

  entity_عددی: "حروف &#169; و &#x1F600; حفظ می‌شوند.\n",

  entity_قالب‌دار: "**حق نشر &copy; محفوظ است.**\n",

  افزونه‌های_HTML_درون‌خطی: "<abbr title=\"HyperText Markup Language\">HTML</abbr> و <mark>مهم</mark> و <ins>افزوده</ins> و H<sub>2</sub>O و x<sup>2</sup>\n",

  فهرست_تعریف_HTML: "<dl><dt>واژه</dt><dd>تعریف</dd></dl>\n",

  متن_CJK: "日本語の文と中文段落 و فارسی\n",

  پایان_خط_CRLF: "خط اول\r\n\r\nخط دوم\r\n",
};

describe("رفت‌وبرگشت — serialize(parse(md)) === md", () => {
  for (const [name, md] of Object.entries(fixtures)) {
    it(name, () => {
      expect(serialize(parse(md))).toBe(md);
    });
  }
});

describe("directiveِ ناشناخته", () => {
  it("نه خطا می‌دهد نه حذف می‌شود", () => {
    const md = ":::کاملاً‌ناشناخته{صفتِ‌عجیب=۱۲۳}\nمحتوا\n:::\n";
    const doc = parse(md);
    const out = serialize(doc);
    expect(out).toContain("کاملاً‌ناشناخته");
    expect(out).toContain("صفتِ‌عجیب");
    expect(out).toContain("محتوا");
  });

  it("صفاتش دست‌نخورده می‌مانند", () => {
    const doc = parse(":::x{a=1 b=2 c=3}\nمحتوا\n:::\n");
    const node = doc.child(0);
    expect(node.type.name).toBe("directive_block");
    expect(node.attrs.attributes).toEqual({ a: "1", b: "2", c: "3" });
  });
});

describe("نیم‌فاصله", () => {
  it("در رفت‌وبرگشت گم نمی‌شود", () => {
    const md = "می‌شود\n";
    expect(serialize(parse(md))).toContain("‌");
  });
});

describe("تنظیم Linkify", () => {
  it("نشانی ساده را فقط در حالت روشن به لینک تبدیل می‌کند و سورس ثابت می‌ماند", () => {
    const md = "https://example.com\n";
    const linked = parse(md);
    const plain = parse(md, { linkify: false });
    const linkedMark = linked.firstChild?.firstChild?.marks.find((mark) => mark.type.name === "link");
    const plainMark = plain.firstChild?.firstChild?.marks.find((mark) => mark.type.name === "link");
    expect(linkedMark?.attrs.inactive).toBe(false);
    expect(plainMark?.attrs.inactive).toBe(true);
    expect(serialize(linked)).toBe(md);
    expect(serialize(plain)).toBe(md);
  });

  it("لینک صریح حتی با Linkify خاموش لینک می‌ماند", () => {
    const doc = parse("[سایت](https://example.com)\n", { linkify: false });
    expect(doc.firstChild?.firstChild?.marks.some((mark) => mark.type.name === "link")).toBe(true);
  });
});

describe("جدول", () => {
  /**
   * ★ جدول تنها جایی است که خروجی **عیناً** ورودی نیست.
   *
   * remark ردیفِ جداکننده را به کمینه‌اش نرمال می‌کند (`| - | - |`). همین
   * شکل، شکلِ متعارفِ خودش است — یعنی بارِ دوم دیگر عوض نمی‌شود. پس شرطِ
   * واقعی «پایداری» است نه «هم‌سانیِ بایتی»: سندی که یک‌بار ذخیره شده،
   * دفعهٔ بعد دست نمی‌خورد. محتوا و تراز کاملاً حفظ می‌شوند.
   */
  const cases: Record<string, string> = {
    ساده: "| الف | ب |\n| - | - |\n| ۱ | ۲ |\n",
    با_تراز: "| چپ | وسط | راست |\n| :- | :-: | -: |\n| ۱ | ۲ | ۳ |\n",
    // سلولِ خالی بی فاصلهٔ اضافی نوشته می‌شود — شکلِ متعارفِ remark.
    سلولِ_خالی: "| الف | ب |\n| - | - |\n| ۱ | |\n",
    فارسی: "| نام | مقدار |\n| - | - |\n| ماده ۵۰ | معتبر |\n",
    با_تأکید: "| الف | ب |\n| - | - |\n| **پررنگ** | *کج* |\n",
  };
  for (const [name, md] of Object.entries(cases)) {
    it(`${name} — پایدار است`, () => {
      expect(serialize(parse(md))).toBe(md);
    });
  }

  it("★ جدولِ با فاصله‌گذاریِ دیگر، بارِ دوم دیگر عوض نمی‌شود", () => {
    const original = "| الف | ب |\n| --- | --- |\n| ۱ | ۲ |\n";
    const once = serialize(parse(original));
    const twice = serialize(parse(once));
    expect(twice).toBe(once);
  });

  it("تراز در رفت‌وبرگشت حفظ می‌شود", () => {
    const doc = parse("| چپ | وسط | راست |\n| :- | :-: | -: |\n| ۱ | ۲ | ۳ |\n");
    const header = doc.child(0).child(0);
    expect([0, 1, 2].map((i) => header.child(i).attrs.align)).toEqual([
      "left",
      "center",
      "right",
    ]);
  });

  it("سلولِ ردیفِ اول header است، بقیه cell", () => {
    const doc = parse("| الف |\n| - |\n| ۱ |\n");
    expect(doc.child(0).child(0).child(0).type.name).toBe("table_header");
    expect(doc.child(0).child(1).child(0).type.name).toBe("table_cell");
  });
});

describe("فوت‌نوت", () => {
  const cases: Record<string, string> = {
    ساده: "متن با فوت‌نوت[^1]\n\n[^1]: توضیحِ فوت‌نوت\n",
    شناسهٔ_فارسی: "متن[^۱]\n\n[^۱]: توضیح\n",
    شناسهٔ_متنی: "متن[^منبع]\n\n[^منبع]: کتابِ فلان\n",
    چند_تا: "الف[^1] و ب[^2]\n\n[^1]: یک\n\n[^2]: دو\n",
    با_تأکید: "متن[^1]\n\n[^1]: توضیحِ **پررنگ**\n",
  };
  for (const [name, md] of Object.entries(cases)) {
    it(name, () => {
      expect(serialize(parse(md))).toBe(md);
    });
  }

  it("★ ارجاع و تعریف به گره‌های درست می‌روند", () => {
    const doc = parse("متن[^1]\n\n[^1]: توضیح\n");
    let ref: string | null = null;
    let def: string | null = null;
    doc.descendants((n) => {
      if (n.type.name === "footnote_reference") ref = n.attrs.identifier as string;
      if (n.type.name === "footnote_definition") def = n.attrs.identifier as string;
      return true;
    });
    expect(ref).toBe("1");
    expect(def).toBe("1");
  });

  it("★ ارجاعِ بی‌تعریف، سند را نمی‌شکند", () => {
    // کاربر ممکن است تعریف را پاک کند.
    //
    // نکته: بی تعریف، این اصلاً فوت‌نوت نیست — GFM آن را متنِ عادی
    // می‌بیند. remark هم `[` را escape می‌کند (`متن\[^گمشده]`) تا بارِ
    // بعد به‌اشتباه فوت‌نوت خوانده نشود. پس شرط، پایداری است نه
    // هم‌سانیِ بایتی: محتوا نمی‌پرد و بارِ دوم دیگر عوض نمی‌شود.
    const md = "متن[^گمشده]\n";
    expect(() => parse(md)).not.toThrow();

    const once = serialize(parse(md));
    expect(once).toContain("گمشده");
    expect(serialize(parse(once))).toBe(once);
  });
});
