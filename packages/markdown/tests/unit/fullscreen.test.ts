import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFullscreen } from "../../src/react/useFullscreen.js";

/**
 * تمام‌صفحه.
 *
 * ★ چیزی که واقعاً ارزشِ تست دارد: **مسیرِ بازگشت**. Fullscreen APIِ
 * مرورگر همه‌جا نیست و گاهی رد می‌شود؛ آن حالت نباید شکست باشد.
 * jsdom هم اصلاً `requestFullscreen` ندارد، پس دقیقاً همان محیط است.
 */

function target() {
  const el = document.createElement("div");
  document.body.append(el);
  return el;
}

describe("تمام‌صفحه", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("در آغاز خاموش است", () => {
    const el = target();
    const { result } = renderHook(() => useFullscreen(() => el));
    expect(result.current.active).toBe(false);
    expect(result.current.soft).toBe(false);
  });

  it("★ بی API، به حالتِ نرم می‌رود — نه شکست", () => {
    const el = target();
    // jsdom `requestFullscreen` ندارد؛ همان حالتِ iframe بی مجوز.
    expect(el.requestFullscreen).toBeUndefined();

    const { result } = renderHook(() => useFullscreen(() => el));
    act(() => result.current.toggle());

    expect(result.current.active).toBe(true);
    expect(result.current.soft).toBe(true);
  });

  it("دوباره زدن، خاموش می‌کند", () => {
    const el = target();
    const { result } = renderHook(() => useFullscreen(() => el));
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(result.current.active).toBe(false);
    expect(result.current.soft).toBe(false);
  });

  it("★ `Escape` در حالتِ نرم بیرون می‌آورد", () => {
    const el = target();
    const { result } = renderHook(() => useFullscreen(() => el));
    act(() => result.current.toggle());
    expect(result.current.active).toBe(true);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.active).toBe(false);
  });

  it("★ APIِ رد‌شده هم به حالتِ نرم می‌رود، نه خطا", async () => {
    const el = target();
    // مثلِ `iframe` بی `allow="fullscreen"`.
    el.requestFullscreen = vi.fn().mockRejectedValue(new Error("not allowed"));

    const { result } = renderHook(() => useFullscreen(() => el));
    await act(async () => {
      result.current.toggle();
      // به promiseِ ردشده فرصتِ رسیدن بده.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.active).toBe(true);
    expect(result.current.soft).toBe(true);
  });

  it("★ APIِ موفق، حالتِ نرم نمی‌سازد", async () => {
    const el = target();
    el.requestFullscreen = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useFullscreen(() => el));
    await act(async () => {
      result.current.toggle();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.active).toBe(true);
    expect(result.current.soft).toBe(false);
  });

  it("عنصرِ نبوده، خطا نمی‌دهد", () => {
    const { result } = renderHook(() => useFullscreen(() => null));
    act(() => result.current.toggle());
    expect(result.current.active).toBe(false);
  });
});
