/** نگه‌داشتنِ نقطهٔ خواندن هنگامِ تغییر ارتفاعِ ناشی از بازوبسته‌شدن. */

interface ScrollAnchor {
  readonly scroller: HTMLElement;
  readonly top: number;
}

export type ScrollAnchorTarget = HTMLElement | null | (() => HTMLElement | null);

function findScroller(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element;
  while (current) {
    if (/auto|scroll|overlay/.test(getComputedStyle(current).overflowY)) return current;
    current = current.parentElement;
  }
  return document.scrollingElement as HTMLElement | null;
}

/**
 * عنصرِ داده‌شده باید پس از تغییر نیز باقی بماند: عنوان برای section و
 * header برای card. اختلافِ آن با viewport به scrollTop برگردانده می‌شود.
 */
export function preserveScrollAnchor(target: ScrollAnchorTarget, change: () => void): void {
  const resolve = typeof target === "function" ? target : () => target;
  const element = resolve();
  const scroller = element ? findScroller(element) : null;
  const anchor: ScrollAnchor | null = element && scroller
    ? { scroller, top: element.getBoundingClientRect().top }
    : null;

  change();
  if (!anchor) return;

  const compensate = () => {
    const current = resolve();
    if (!current?.isConnected || !anchor.scroller.isConnected) return;
    const delta = current.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) > 0.25) anchor.scroller.scrollTop += delta;
  };
  // مروگر ممکن است اسکرولِ پیش‌فرضِ pointer را بعد از mousedown انجام دهد
  // و React/transition هم ارتفاع را یک tick بعد عوض کنند. چند تصحیحِ کوتاه
  // (فقط وقتی اختلاف وجود دارد) لنگرِ نقطهٔ خواندن را پایدار نگه می‌دارد.
  for (const delay of [0, 16, 64, 160, 320]) {
    window.setTimeout(compensate, delay);
  }
}
