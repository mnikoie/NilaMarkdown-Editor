"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * تمام‌صفحه.
 *
 * ★ **دو حالتِ متفاوت، نه یکی.** Fullscreen APIِ مرورگر (`F11`ِ واقعی)
 * کلِ صفحه را می‌گیرد و نوارِ آدرس را هم پنهان می‌کند — ولی همه‌جا در
 * دسترس نیست: داخلِ `iframe` بی `allow="fullscreen"` رد می‌شود، و در
 * سافاریِ iOS اصلاً نیست.
 *
 * پس اگر API نبود یا رد شد، به **تمام‌صفحهٔ نرم** برمی‌گردیم: ادیتور با
 * `position: fixed` کلِ viewport را می‌گیرد. از نظرِ کاربر تقریباً همان
 * است، و هرگز شکست نمی‌خورد.
 *
 * ★ `Escape` در هر دو حالت بیرون می‌آورد. در حالتِ واقعی خودِ مرورگر این
 * کار را می‌کند و ما فقط حالتِ خودمان را هم‌گام می‌کنیم؛ در حالتِ نرم
 * خودمان گوش می‌دهیم.
 */

/** بخشی از API که استفاده می‌کنیم، با پیشوندهای قدیمیِ وبکیت. */
interface FullscreenCapable extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}
interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

function currentElement(): Element | null {
  if (typeof document === "undefined") return null;
  const d = document as FullscreenDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

export interface FullscreenHandle {
  /** الان تمام‌صفحه است؟ (هر دو حالت) */
  active: boolean;
  /** حالتِ نرم است؟ یعنی API در دسترس نبود. */
  soft: boolean;
  toggle: () => void;
  exit: () => void;
}

export function useFullscreen(target: () => HTMLElement | null): FullscreenHandle {
  const [active, setActive] = useState(false);
  const [soft, setSoft] = useState(false);

  // مرورگر ممکن است **خودش** از تمام‌صفحه بیرون بیاید (`Escape`، تعویضِ
  // تب). بی این، دکمه می‌گفت «تمام‌صفحه» ولی حالتِ ما هنوز روشن بود.
  useEffect(() => {
    const sync = () => {
      const real = currentElement() !== null;
      // فقط حالتِ واقعی را دنبال کن؛ حالتِ نرم دستِ خودمان است.
      setActive((prev) => (soft ? prev : real));
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, [soft]);

  const exit = useCallback(() => {
    const d = document as FullscreenDocument;
    if (currentElement()) {
      void (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
    }
    setSoft(false);
    setActive(false);
  }, []);

  // `Escape` در حالتِ نرم — در حالتِ واقعی خودِ مرورگر انجامش می‌دهد.
  useEffect(() => {
    if (!soft || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        exit();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [soft, active, exit]);

  const toggle = useCallback(() => {
    if (active) {
      exit();
      return;
    }

    const el = target() as FullscreenCapable | null;
    if (!el) return;

    const request = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
    if (!request) {
      // API نیست → حالتِ نرم.
      setSoft(true);
      setActive(true);
      return;
    }

    // ★ `requestFullscreen` ممکن است **رد شود** (iframe بی مجوز، سیاستِ
    // مرورگر). آن هم شکست نیست — به حالتِ نرم می‌رویم.
    void Promise.resolve(request())
      .then(() => setActive(true))
      .catch(() => {
        setSoft(true);
        setActive(true);
      });
  }, [active, exit, target]);

  return { active, soft, toggle, exit };
}
