"use client";

import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent, RefObject } from "react";

/** رفتار مشترک منوهای برنامه بر اساس الگوی keyboard menu در ARIA. */
export function useMenuKeyboard(
  open: boolean,
  close: () => void,
): {
  rootRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
} {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      rootRef.current
        ?.querySelector<HTMLButtonElement>('.tm-menu-panel button:not(:disabled)')
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      requestAnimationFrame(() => triggerRef.current?.focus());
      return;
    }

    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.tm-menu-panel button:not(:disabled)')]
      .filter((button) => button.getClientRects().length > 0);
    if (!buttons.length) return;
    const current = document.activeElement as HTMLButtonElement | null;
    const index = Math.max(0, buttons.indexOf(current!));

    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
      return;
    }

    const rtl = getComputedStyle(root).direction === "rtl";
    const expandKey = rtl ? "ArrowLeft" : "ArrowRight";
    const collapseKey = rtl ? "ArrowRight" : "ArrowLeft";
    if (event.key === expandKey && current?.getAttribute("aria-haspopup") === "menu") {
      event.preventDefault();
      if (current.getAttribute("aria-expanded") !== "true") current.click();
      requestAnimationFrame(() => current.parentElement?.querySelector<HTMLButtonElement>('.tm-menu-submenu button:not(:disabled)')?.focus());
    } else if (event.key === collapseKey) {
      const submenu = current?.closest(".tm-menu-submenu");
      const parent = submenu?.parentElement?.querySelector<HTMLButtonElement>(':scope > button[aria-haspopup="menu"]');
      if (parent) {
        event.preventDefault();
        parent.click();
        parent.focus();
      }
    }
  }, [close]);

  return { rootRef, triggerRef, onKeyDown };
}
