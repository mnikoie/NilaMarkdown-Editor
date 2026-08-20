import { describe, it, expect } from "vitest";
import { parse } from "../../src/core/markdown/parse.js";
import { serialize } from "../../src/core/markdown/serialize.js";
import { buildOutline } from "../../src/core/outline/build.js";
import { computeStats } from "../../src/core/stats.js";

/**
 * بنچمارک — بندِ ۱۳ پرامپت: «عدد را اندازه بگیر، حدس نزن.»
 *
 * سندِ آزمایشی طبقِ همان بند: ۵۰۰۰ خط با ۵۰ بلوکِ کد، ۲۰ جدول و
 * ۱۰۰ تصویر.
 *
 * ⚠️ این اعداد **بی مرورگر** اندازه گرفته می‌شوند — یعنی فقط هزینهٔ
 * parse/serialize/outline، نه رندر. تأخیرِ تایپِ واقعی باید در مرورگر
 * سنجیده شود.
 */

function makeBigDocument(): string {
  const parts: string[] = ["---", "شناسه: بنچمارک", "---", ""];

  for (let chapter = 1; chapter <= 90; chapter++) {
    parts.push(`# فصل ${chapter} {#fasl-${chapter}}`, "");

    for (let article = 1; article <= 5; article++) {
      const num = chapter * 10 + article;
      parts.push(`::::ماده{شماره=${num} وضعیت=معتبر}`);
      parts.push(
        `کارفرما مکلف است **حق بیمه** را در مهلتِ مقرر بپردازد. ` +
          `این بند به :ref[ماده ۵۰]{هدف=قانون#ماده-۵۰} ارجاع دارد.`,
        "",
      );
      parts.push(`:::تبصره{شماره=۱}`, "در صورتِ تأخیر جریمه تعلق می‌گیرد.", ":::", "");
      parts.push("::::", "");
    }

    // ۵۰ بلوکِ کد — یکی به ازای هر فصل
    parts.push("```ts", `const chapter${chapter} = ${chapter};`, "```", "");

    // ۲۰ جدول
    if (chapter % 3 === 0) {
      parts.push("| ماده | وضعیت | تاریخ |", "| - | :-: | -: |");
      for (let r = 1; r <= 5; r++) {
        parts.push(`| ${r} | معتبر | ۱۳۵۵/۱۰/۲۵ |`);
      }
      parts.push("");
    }

    // ۱۰۰ تصویر
    parts.push(`![تصویرِ ${chapter}](https://example.com/${chapter}.png)`, "");
    parts.push(`![تصویرِ دومِ ${chapter}](https://example.com/${chapter}b.png)`, "");

    parts.push("- یک", "- دو", "- سه", "");
    parts.push("> نقلِ قولِ نمونه با متنِ فارسیِ نسبتاً بلند برای واقعی‌بودنِ سند.", "");
  }

  return parts.join("\n") + "\n";
}

const BIG = makeBigDocument();

function ms(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

describe("کارایی — سندِ بزرگ", () => {
  it("سند واقعاً بزرگ است", () => {
    const lines = BIG.split("\n").length;
    // eslint-disable-next-line no-console
    console.log(`\n  سندِ آزمایشی: ${lines} خط، ${(BIG.length / 1024).toFixed(0)} کیلوبایت`);
    expect(lines).toBeGreaterThan(3000);
  });

  it("parse زیرِ ۱۰۰۰ میلی‌ثانیه", () => {
    const t = ms(() => parse(BIG));
    // eslint-disable-next-line no-console
    console.log(`  parse:      ${t.toFixed(0)} ms`);
    expect(t).toBeLessThan(1000);
  });

  it("serialize زیرِ ۱۰۰۰ میلی‌ثانیه", () => {
    const doc = parse(BIG);
    const t = ms(() => serialize(doc));
    // eslint-disable-next-line no-console
    console.log(`  serialize:  ${t.toFixed(0)} ms`);
    expect(t).toBeLessThan(1000);
  });

  it("buildOutline زیرِ ۲۰۰ میلی‌ثانیه", () => {
    const doc = parse(BIG);
    const t = ms(() => buildOutline(doc));
    // eslint-disable-next-line no-console
    console.log(`  outline:    ${t.toFixed(0)} ms`);
    expect(t).toBeLessThan(200);
  });

  it("computeStats زیرِ ۲۰۰ میلی‌ثانیه", () => {
    const doc = parse(BIG);
    const t = ms(() => computeStats(doc));
    // eslint-disable-next-line no-console
    console.log(`  stats:      ${t.toFixed(0)} ms`);
    expect(t).toBeLessThan(200);
  });

  it("★ رفت‌وبرگشتِ سندِ بزرگ پایدار است", () => {
    const once = serialize(parse(BIG));
    const twice = serialize(parse(once));
    expect(twice).toBe(once);
  });

  it("درختِ سندِ بزرگ درست ساخته می‌شود", () => {
    const tree = buildOutline(parse(BIG));
    expect(tree).toHaveLength(90); // ۹۰ فصل
    expect(tree[0]!.children).toHaveLength(5); // ۵ ماده در هر فصل
    expect(tree[0]!.children[0]!.children).toHaveLength(1); // ۱ تبصره
  });
});
