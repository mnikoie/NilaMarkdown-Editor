/// <reference lib="webworker" />

import type { WorkerRequest, WorkerResponse } from "./protocol.js";
import { THEMES } from "./protocol.js";
import { GITHUB_LIGHT, GITHUB_DARK } from "./themes.js";
import { LANGS, resolveLang } from "./langs.js";

/**
 * رنگ‌آمیزیِ کد — در Web Worker.
 *
 * ★ **چرا این فایل وجود دارد** (بندِ ۱۳ پرامپت): در مرورگرِ واقعی اندازه
 * گرفته شد که `import("shiki")` در رشتهٔ اصلی، صفحه را چند ثانیه
 * بی‌پاسخ می‌کند — تا حدی که `page.evaluate` هم timeout می‌خورد. مسئله
 * گرامرها نبودند (با `langs: []` هم همین بود) بلکه خودِ بارگذاریِ ماژول.
 * تنها راهِ درست، بردنش به رشتهٔ دیگر است، نه بهینه‌کردنش.
 *
 * ★ **موتورِ JavaScript، نه Oniguruma/WASM.** موتورِ پیش‌فرضِ Shiki یک
 * فایلِ `.wasm` جدا لازم دارد که مسیرش را باندلرِ مصرف‌کننده باید حل
 * کند — و همان‌جاست که در Next می‌شکند. موتورِ JS همان گرامرها را با
 * RegExp اجرا می‌کند: کمی کندتر، ولی اینجا در رشتهٔ پس‌زمینه است و
 * کندی‌اش دیده نمی‌شود. یک فایلِ جانبیِ کمتر یعنی یک راهِ شکستِ کمتر.
 *
 * ★ **این فایل چیزی از بقیهٔ پکیج import نمی‌کند.** اگر می‌کرد، باندلِ
 * worker همهٔ ProseMirror را هم می‌گرفت.
 */

interface Highlighter {
  codeToHtml(
    code: string,
    options: { lang: string; themes: { light: string; dark: string } },
  ): string;
  getLoadedLanguages(): string[];
  loadLanguage(lang: unknown): Promise<void>;
}

let highlighter: Promise<Highlighter | null> | null = null;

/** زبان‌هایی که یک‌بار امتحان شده‌اند — تا برای هر بلوک دوباره import نشود. */
const attempted = new Map<string, Promise<boolean>>();

async function create(): Promise<Highlighter | null> {
  try {
    const [core, engine] = await Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
    ]);
    return (await core.createHighlighterCore({
      themes: [GITHUB_LIGHT, GITHUB_DARK] as never,
      // ★ هیچ زبانی از پیش نه — هر کدام با اولین استفاده.
      langs: [],
      engine: engine.createJavaScriptRegexEngine({ forgiving: true }),
    })) as unknown as Highlighter;
  } catch {
    // هر شکستی → کدِ خام. حالتِ عادی است، نه خطا.
    return null;
  }
}

function get(): Promise<Highlighter | null> {
  highlighter ??= create();
  return highlighter;
}

/**
 * گرامرِ یک زبان.
 *
 * نتیجه cache می‌شود: سندی با ۹۰ بلوکِ `ts` یک‌بار گرامر می‌گیرد، نه
 * ۹۰ بار.
 */
function loadLang(hl: Highlighter, lang: string): Promise<boolean> {
  const cached = attempted.get(lang);
  if (cached) return cached;

  const task = (async () => {
    if (hl.getLoadedLanguages().includes(lang)) return true;
    try {
      const mod = await LANGS[lang]!();
      await hl.loadLanguage(mod.default);
      return true;
    } catch {
      return false;
    }
  })();

  attempted.set(lang, task);
  return task;
}

async function handle(
  req: Extract<WorkerRequest, { type: "highlight" }>,
): Promise<WorkerResponse> {
  // زبانِ بیرونِ فهرست → خام، بی اینکه اصلاً Shiki بار شود.
  const lang = resolveLang(req.lang);
  if (!lang) return { type: "fail", id: req.id, reason: "unknown-language" };

  const hl = await get();
  if (!hl) return { type: "fail", id: req.id, reason: "shiki-unavailable" };

  if (!(await loadLang(hl, lang))) {
    return { type: "fail", id: req.id, reason: "grammar-failed" };
  }

  try {
    const html = hl.codeToHtml(req.code, { lang, themes: THEMES });
    return { type: "ok", id: req.id, html };
  } catch {
    return { type: "fail", id: req.id, reason: "highlight-failed" };
  }
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (!req || typeof req !== "object") return;

  if (req.type === "dispose") {
    self.close();
    return;
  }

  if (req.type === "highlight") {
    void handle(req).then((res) => self.postMessage(res));
  }
});

// ★ آخرین خط، بعد از ثبتِ شنونده: «حالا امن است که بفرستی».
// بی این، پیام‌های زودرس گم می‌شوند — در `protocol.ts` توضیح داده شد.
self.postMessage({ type: "ready" } satisfies WorkerResponse);
