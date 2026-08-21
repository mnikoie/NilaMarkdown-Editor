import type { Node as PMNode } from "prosemirror-model";

/**
 * شمارشِ کلمه و کاراکتر و زمانِ خواندن.
 *
 * ★ شمارشِ کلمه در فارسی با انگلیسی فرق دارد و `split(" ")` غلط است:
 *
 * - نیم‌فاصله (ZWNJ) **مرزِ کلمه نیست**. «می‌شود» یک کلمه است، نه دو.
 * - «کتاب‌ها» یک کلمه است.
 * - علائم (`،` `؛` `؟`) نباید کلمه شمرده شوند.
 *
 * اگر با `split(/\s+/)` بشماریم، متنِ فارسی حدودِ ۲۰٪ بیشتر شمرده می‌شود.
 */

export interface Stats {
  words: number;
  characters: number;
  /** بی فاصله. */
  charactersNoSpaces: number;
  paragraphs: number;
  readingMinutes: number;
  wordsPerMinute: number;
}

/** مبنای قابل‌تنظیم؛ ۲۵۰ برای خواندنِ بی‌صدای متنِ عمومی. */
export const DEFAULT_WORDS_PER_MINUTE = 250;

export interface StatsOptions {
  wordsPerMinute?: number;
}

const ZWNJ = "‌";

/**
 * کلمه‌ها را می‌شمارد.
 *
 * روش: هر دنبالهٔ پیوستهٔ «حرف یا رقم یا نیم‌فاصله» یک کلمه است.
 * `\p{L}` همهٔ حروفِ یونیکد را می‌گیرد — فارسی، عربی، لاتین، و بقیه.
 */
export function countWords(text: string): number {
  const matches = text.match(new RegExp(`[\\p{L}\\p{N}${ZWNJ}'’-]+`, "gu"));
  if (!matches) return 0;
  // دنباله‌ای که فقط نیم‌فاصله یا خط تیره است، کلمه نیست.
  return matches.filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function computeStats(doc: PMNode, options: StatsOptions = {}): Stats {
  let text = "";
  let paragraphs = 0;

  doc.descendants((node) => {
    if (node.isTextblock) {
      const content = node.textContent;
      if (content.trim()) {
        text += content + "\n";
        paragraphs++;
      }
      // داخلِ بلوکِ متنی نرو — `textContent` همه‌اش را گرفته.
      return false;
    }
    return true;
  });

  const words = countWords(text);
  const wordsPerMinute = Number.isFinite(options.wordsPerMinute)
    ? Math.max(1, Math.round(options.wordsPerMinute!))
    : DEFAULT_WORDS_PER_MINUTE;
  const characters = [...text].length; // `[...]` تا ایموجیِ خارج از BMP یکی شمرده شود
  const charactersNoSpaces = [...text.replace(/\s/g, "")].length;

  return {
    words,
    characters,
    charactersNoSpaces,
    paragraphs,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / wordsPerMinute)),
    wordsPerMinute,
  };
}
