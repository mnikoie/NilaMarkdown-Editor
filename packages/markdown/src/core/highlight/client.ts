import type { WorkerRequest, WorkerResponse } from "./protocol.js";

/**
 * سمتِ رشتهٔ اصلیِ رنگ‌آمیزی.
 *
 * ★ **قرارداد:** `highlight()` هرگز throw نمی‌کند. اگر Worker پشتیبانی
 * نشود، Shiki نصب نباشد، زبان ناشناخته باشد یا هر چیزِ دیگر — `null`
 * برمی‌گردد و فراخوان کدِ خام را نگه می‌دارد. سند نباید بشکند.
 *
 * ★ **یک worker برای کلِ برنامه.** هر NodeViewِ بلوکِ کد یکی نمی‌سازد؛
 * سندی با ۹۰ بلوکِ کد ۹۰ رشته باز می‌کرد.
 */

export interface HighlightResult {
  html: string;
}

type Pending = {
  resolve: (value: HighlightResult | null) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * مهلتِ پیامِ `ready`. کوتاه است چون فقط اجرای بدنهٔ worker را می‌سنجد،
 * نه دانلودِ Shiki — آن بعد از `ready` اتفاق می‌افتد.
 */
const READY_TIMEOUT_MS = 4_000;

/**
 * سقفِ انتظار برای یک بلوک. بعد از آن، کدِ خام.
 *
 * سخاوتمندانه چون **اولین** درخواست باید منتظرِ بالاآمدنِ worker،
 * دانلودِ Shiki و گرفتنِ گرامرِ زبان بماند. بعدی‌ها میلی‌ثانیه‌ای‌اند.
 * سقف‌زدن اینجا بی‌ضرر است: انقضا فقط یعنی «خام بماند».
 */
const TIMEOUT_MS = 30_000;

/** حافظهٔ نتیجه — کلید: `lang\u0000code`. */
const cache = new Map<string, string>();
/** سقفِ حافظه، تا سندِ بزرگ حافظه را نخورد. */
const CACHE_MAX = 500;

let worker: Worker | null = null;
/** یک‌بار که شکست خورد، دیگر تلاش نکن — وگرنه هر بلوک دوباره امتحان می‌کند. */
let unavailable = false;
let nextId = 1;
const pending = new Map<number, Pending>();

/**
 * worker پیامِ `ready` را فرستاده؟
 *
 * ★ **این نه احتیاط است نه سلیقه.** باندلرها worker را نامتقارن بار
 * می‌کنند: `new Worker(...)` فوراً برمی‌گردد ولی shim هنوز ماژولِ ما را
 * اجرا نکرده. پیامی که در آن فاصله برود شنونده ندارد و **بی‌صدا گم
 * می‌شود**. در Turbopack اندازه‌گیری شد — بلوکِ کد تا ابد `pending`
 * می‌ماند و هیچ خطایی هم چاپ نمی‌شود.
 */
let ready = false;
/** نوعی که الان امتحان می‌شود. `module` اول، چون Vite و webpack آن را می‌خواهند. */
let workerType: WorkerType = "module";
/** مهلتِ رسیدنِ `ready`. بعد از آن، نوعِ دیگر امتحان می‌شود. */
let readyTimer: ReturnType<typeof setTimeout> | null = null;
/** یک‌بار ساخته می‌شود و بینِ دو تلاش مشترک است. */
let workerUrl: URL | null = null;
/** درخواست‌هایی که قبل از `ready` رسیده‌اند. */
let queue: WorkerRequest[] = [];

/** برای تست: بازگرداندنِ ماژول به حالتِ اول. */
export function resetHighlighter(): void {
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.resolve(null);
  }
  pending.clear();
  if (readyTimer) {
    clearTimeout(readyTimer);
    readyTimer = null;
  }
  worker?.terminate();
  worker = null;
  unavailable = false;
  ready = false;
  workerType = "module";
  queue = [];
  cache.clear();
}

/** worker زنده است؟ فقط برای تست و تشخیص. */
export function highlighterStatus(): "idle" | "running" | "unavailable" {
  if (unavailable) return "unavailable";
  return worker ? "running" : "idle";
}

/** نوعی که در نهایت جواب داد — برای تشخیص. `null` یعنی هنوز `ready` نیامده. */
export function highlighterWorkerType(): WorkerType | null {
  return ready ? workerType : null;
}

function fail(): null {
  unavailable = true;
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.resolve(null);
  }
  pending.clear();
  if (readyTimer) {
    clearTimeout(readyTimer);
    readyTimer = null;
  }
  worker = null;
  ready = false;
  queue = [];
  return null;
}

function getWorker(): Worker | null {
  if (unavailable) return null;
  if (worker) return worker;

  // بیرونِ مرورگر (Node، jsdom) اصلاً worker ساخته نمی‌شود.
  if (typeof Worker === "undefined") {
    unavailable = true;
    return null;
  }

  // ★ `new URL(..., import.meta.url)` تنها شکلی است که Vite، webpack۵،
  // Next/Turbopack و Rollup هر چهار از آن worker می‌سازند. رشتهٔ ساده یا
  // مسیرِ متغیر در هیچ‌کدام کار نمی‌کند.
  workerUrl ??= new URL("./worker.js", import.meta.url);

  try {
    worker = new Worker(workerUrl, { type: workerType, name: "tm-highlight" });
  } catch {
    return fail();
  }

  // ★ **مهلتِ `ready`، و بعد امتحانِ نوعِ دیگر.**
  //
  // اینجا تلهٔ واقعی‌ای بود که وقت گرفت. باندلرها worker را با یک «shim»
  // بار می‌کنند و **خودشان** تصمیم می‌گیرند بدنه ماژول باشد یا اسکریپتِ
  // کلاسیک. Turbopack در بیلدِ تولیدی بدنه را کلاسیک می‌سازد و با
  // `importScripts` بار می‌کند — و `importScripts` در workerِ نوعِ
  // `module` **وجود ندارد**.
  //
  // شکستش هم بی‌صداست: `new Worker` موفق می‌شود، فایلِ shim ۲۰۰ می‌گیرد،
  // ولی بدنه هرگز اجرا نمی‌شود. نه خطایی در کنسول، نه درخواستی برای
  // Shiki — بلوکِ کد فقط تا ابد `pending` می‌ماند. سازندهٔ Worker هم
  // throw نمی‌کند، پس `try/catch` کمکی نمی‌کند.
  //
  // تنها تشخیصِ قابلِ اتکا، **نیامدنِ `ready`** است.
  readyTimer = setTimeout(() => {
    if (ready) return;
    if (workerType === "module") {
      // نوعِ دیگر را امتحان کن — همان درخواست‌ها در صف می‌مانند.
      workerType = "classic";
      worker?.terminate();
      worker = null;
      getWorker();
      return;
    }
    // هر دو نوع شکست خورد → کدِ خام.
    fail();
  }, READY_TIMEOUT_MS);

  worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const res = event.data;

    if (res.type === "ready") {
      ready = true;
      if (readyTimer) {
        clearTimeout(readyTimer);
        readyTimer = null;
      }
      const waiting = queue;
      queue = [];
      for (const req of waiting) send(req);
      return;
    }

    const p = pending.get(res.id);
    if (!p) return;
    pending.delete(res.id);
    clearTimeout(p.timer);
    p.resolve(res.type === "ok" ? { html: res.html } : null);
  });

  // خطای بارگذاریِ خودِ worker (مسیرِ اشتباه، CSP، ...) — همان مسیرِ
  // «نصب نیست»: کدِ خام، بی سروصدا.
  worker.addEventListener("error", () => fail());
  worker.addEventListener("messageerror", () => fail());

  return worker;
}

/** فرستادن — یا صف‌کردن تا `ready`. */
function send(req: WorkerRequest): void {
  const w = worker;
  if (!w) return;
  if (!ready) {
    queue.push(req);
    return;
  }
  try {
    w.postMessage(req);
  } catch {
    fail();
  }
}

function remember(key: string, html: string) {
  if (cache.size >= CACHE_MAX) {
    // ساده‌ترین بیرون‌اندازی: قدیمی‌ترین. Map ترتیبِ درج را نگه می‌دارد.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, html);
}

/**
 * کد را رنگ می‌کند. `null` یعنی «خام بماند» — نه خطا.
 */
export function highlight(code: string, lang: string): Promise<HighlightResult | null> {
  if (!code || !lang) return Promise.resolve(null);

  const key = `${lang}\u0000${code}`;
  const hit = cache.get(key);
  if (hit !== undefined) return Promise.resolve({ html: hit });

  const w = getWorker();
  if (!w) return Promise.resolve(null);

  const id = nextId++;
  return new Promise<HighlightResult | null>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, TIMEOUT_MS);

    pending.set(id, {
      resolve: (value) => {
        if (value) remember(key, value.html);
        resolve(value);
      },
      timer,
    });

    send({ type: "highlight", id, code, lang });
  });
}
