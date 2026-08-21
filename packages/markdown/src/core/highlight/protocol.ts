/**
 * پروتکلِ بینِ رشتهٔ اصلی و worker.
 *
 * ★ این فایل عمداً هیچ چیزی import نمی‌کند. هر دو طرفِ مرز آن را
 * می‌خوانند و worker نباید با import‌کردنِ آن، ProseMirror یا React را
 * هم با خودش بیاورد.
 */

/** درخواستِ رنگ‌آمیزی. */
export interface HighlightRequest {
  type: "highlight";
  /** شناسهٔ درخواست — پاسخ با همین برمی‌گردد. */
  id: number;
  code: string;
  lang: string;
}

/** خاموش‌کردنِ worker. */
export interface DisposeRequest {
  type: "dispose";
}

export type WorkerRequest = HighlightRequest | DisposeRequest;

/** رنگ‌آمیزی موفق. */
export interface HighlightSuccess {
  type: "ok";
  id: number;
  html: string;
}

/**
 * شکست — زبانِ ناشناخته، Shiki نصب نیست، یا هر چیزِ دیگر.
 *
 * ★ این **خطا نیست**، حالتِ عادی است: فراخوان به کدِ خام برمی‌گردد.
 * پس `reason` فقط برای لاگ و تست است، نه برای نمایش به کاربر.
 */
export interface HighlightFailure {
  type: "fail";
  id: number;
  reason: string;
}

/**
 * «آماده‌ام».
 *
 * ★ **چرا این پیام لازم است:** باندلرها (Turbopack قطعاً) کدِ worker را
 * به‌صورتِ **نامتقارن** بار می‌کنند — یک shim اول اجرا می‌شود و ماژولِ
 * واقعی چند لحظه بعد. پیامی که در آن فاصله فرستاده شود، شنونده‌ای
 * ندارد و **بی‌صدا گم می‌شود**. اندازه‌گیری شد: بلوکِ کد تا ابد در
 * حالتِ `pending` می‌ماند.
 *
 * پس رشتهٔ اصلی تا نیامدنِ این پیام صف می‌کند.
 */
export interface WorkerReady {
  type: "ready";
}

export type WorkerResponse = HighlightSuccess | HighlightFailure | WorkerReady;

/** تم‌ها — یک‌جا، تا worker و CSS از هم واگرا نشوند. */
export const THEMES = { light: "github-light", dark: "github-dark" } as const;
