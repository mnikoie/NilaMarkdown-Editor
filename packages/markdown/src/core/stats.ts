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
}

/** سرعتِ خواندنِ متنِ فارسی — کندتر از انگلیسی. */
const WORDS_PER_MINUTE = 200;

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

export function computeStats(doc: PMNode): Stats {
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
  const characters = [...text].length; // `[...]` تا ایموجیِ خارج از BMP یکی شمرده شود
  const charactersNoSpaces = [...text.replace(/\s/g, "")].length;

  return {
    words,
    characters,
    charactersNoSpaces,
    paragraphs,
    readingMinutes: Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)),
  };
}
