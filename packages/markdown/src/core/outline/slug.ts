/**
 * ساختِ لنگر از متنِ فارسی.
 *
 * چرا `encodeURIComponent` کافی نیست: «فصل چهارم» می‌شود
 * `%D9%81%D8%B5%D9%84...` که در URL نه خوانا است نه قابلِ تایپ. حروفِ فارسی
 * در لنگرِ HTML مجازند، پس نگهشان می‌داریم و فقط چیزهایی را که در URL یا
 * CSS selector مشکل می‌سازند حذف می‌کنیم.
 */

/** ارقامِ فارسی و عربی → انگلیسی. منبع: normalize.py در پروتوتایپ. */
const DIGITS: Record<string, string> = {};
for (const [fa, ar, en] of zip("۰۱۲۳۴۵۶۷۸۹", "٠١٢٣٤٥٦٧٨٩", "0123456789")) {
  DIGITS[fa] = en;
  DIGITS[ar] = en;
}

function* zip(a: string, b: string, c: string) {
  for (let i = 0; i < a.length; i++) yield [a[i], b[i], c[i]] as const;
}

/** حروفِ عربی → فارسی، تا «كتاب» و «کتاب» یک لنگر بگیرند. */
const CHARS: Record<string, string> = {
  "ي": "ی", // ي → ی
  "ى": "ی", // ى → ی
  "ك": "ک", // ك → ک
  "ة": "ه", // ة → ه
  "ـ": "", // تطویل
};

export function slugify(text: string, index = 0): string {
  let s = text.trim();

  s = [...s].map((ch) => CHARS[ch] ?? DIGITS[ch] ?? ch).join("");

  s = s
    // نیم‌فاصله و فاصله‌های نامرئی → خطِ تیره. اگر حذفشان کنیم «می‌شود»
    // به «میشود» تبدیل می‌شود که کلمهٔ دیگری است.
    .replace(/[‌‎‏﻿]/g, "-")
    .replace(/\s+/g, "-")
    // فقط چیزهایی که در لنگر مشکل‌سازند. حرفِ فارسی می‌ماند.
    .replace(/["'`<>{}()[\]#?&=+%\\/:;,.!؟،؛*|^~$@]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");

  if (!s) s = `بخش-${index + 1}`;
  return s;
}

/**
 * یکتاسازی. عنوانِ تکراری در سندِ حقوقی زیاد است («تبصره» بارها تکرار
 * می‌شود)، پس این حالتِ عادی است نه لبه‌ای.
 */
export function makeUnique(slug: string, seen: Map<string, number>): string {
  const n = seen.get(slug) ?? 0;
  seen.set(slug, n + 1);
  return n === 0 ? slug : `${slug}-${n + 1}`;
}
