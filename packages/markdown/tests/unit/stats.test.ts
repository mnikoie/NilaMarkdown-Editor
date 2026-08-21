import { describe, it, expect } from "vitest";
import { countWords, computeStats } from "../../src/core/stats.js";
import { parse } from "../../src/core/markdown/parse.js";

describe("شمارشِ کلمه", () => {
  it("انگلیسیِ ساده", () => {
    expect(countWords("one two three")).toBe(3);
  });

  it("فارسیِ ساده", () => {
    expect(countWords("یک دو سه")).toBe(3);
  });

  it("★ نیم‌فاصله مرزِ کلمه نیست", () => {
    // «می‌شود» یک کلمه است، نه دو. با `split(/\s+/)` دو تا شمرده می‌شد.
    expect(countWords("می‌شود")).toBe(1);
    expect(countWords("کتاب‌های من")).toBe(2);
    expect(countWords("نمی‌خواهم بروم")).toBe(2);
  });

  it("★ علائم کلمه شمرده نمی‌شوند", () => {
    expect(countWords("یک، دو؛ سه؟")).toBe(3);
    expect(countWords("سلام! خوبی?")).toBe(2);
  });

  it("عدد کلمه است", () => {
    expect(countWords("ماده ۵۰ قانون")).toBe(3);
    expect(countWords("۱۳۵۵/۱۰/۲۵")).toBe(3);
  });

  it("متنِ خالی صفر است", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n  ")).toBe(0);
    expect(countWords("،؛؟!")).toBe(0);
  });

  it("مخلوطِ فارسی و انگلیسی", () => {
    expect(countWords("متنِ فارسی با word انگلیسی")).toBe(5);
  });
});

describe("آمارِ سند", () => {
  it("پاراگراف‌ها شمرده می‌شوند", () => {
    const doc = parse("یک\n\nدو\n\nسه\n");
    expect(computeStats(doc).paragraphs).toBe(3);
  });

  it("پاراگرافِ خالی شمرده نمی‌شود", () => {
    expect(computeStats(parse("")).paragraphs).toBe(0);
  });

  it("★ ایموجیِ خارج از BMP یک کاراکتر است", () => {
    // با `.length` دو تا شمرده می‌شد (surrogate pair).
    const doc = parse("😀\n");
    expect(computeStats(doc).characters).toBe(2); // ایموجی + \n
  });

  it("زمانِ خواندن حداقل یک دقیقه است", () => {
    expect(computeStats(parse("یک کلمه\n")).readingMinutes).toBe(1);
  });

  it("سندِ بزرگ، زمانِ معقول می‌دهد", () => {
    const md = Array.from({ length: 400 }, () => "کلمه").join(" ") + "\n";
    const stats = computeStats(parse(md));
    expect(stats.words).toBe(400);
    expect(stats.readingMinutes).toBe(2);
    expect(stats.wordsPerMinute).toBe(250);
  });

  it("سرعتِ خواندن قابل تنظیم است و متنِ خالی صفر دقیقه است", () => {
    const md = Array.from({ length: 600 }, () => "کلمه").join(" ") + "\n";
    expect(computeStats(parse(md), { wordsPerMinute: 300 }).readingMinutes).toBe(2);
    expect(computeStats(parse(md), { wordsPerMinute: 300 }).wordsPerMinute).toBe(300);
    expect(computeStats(parse("")).readingMinutes).toBe(0);
  });

  it("متنِ داخلِ عنوان و فهرست هم شمرده می‌شود", () => {
    const doc = parse("# عنوانِ دو کلمه\n\n- یک\n- دو\n");
    const stats = computeStats(doc);
    expect(stats.words).toBe(5);
  });

  it("کاراکترِ بی‌فاصله درست است", () => {
    const stats = computeStats(parse("اب ج\n"));
    expect(stats.charactersNoSpaces).toBe(3);
  });
});
