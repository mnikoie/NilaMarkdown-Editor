/**
 * فاصلهٔ عمودیِ واقعیِ یک offset در textarea، با احتسابِ شکستنِ نرمِ
 * سطرهای بلند. `lineIndex * lineHeight` فقط خط‌های دارای `\n` را می‌شمارد.
 */
export function sourceOffsetTop(source: HTMLTextAreaElement, offset: number): number {
  const computed = getComputedStyle(source);
  const mirror = document.createElement("div");
  mirror.setAttribute("aria-hidden", "true");
  mirror.style.position = "fixed";
  mirror.style.inset = "0 auto auto -100000px";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.boxSizing = "border-box";
  mirror.style.width = `${source.clientWidth}px`;
  mirror.style.border = "0";

  for (const property of [
    "font-family",
    "font-size",
    "font-style",
    "font-weight",
    "font-stretch",
    "letter-spacing",
    "line-height",
    "padding-block-start",
    "padding-block-end",
    "padding-inline-start",
    "padding-inline-end",
    "text-align",
    "text-indent",
    "text-transform",
    "word-break",
    "overflow-wrap",
    "tab-size",
    "direction",
  ]) {
    mirror.style.setProperty(property, computed.getPropertyValue(property));
  }
  mirror.style.whiteSpace = "pre-wrap";

  mirror.append(document.createTextNode(source.value.slice(0, offset)));
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.append(marker);
  document.body.append(mirror);

  const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
  const top = marker.offsetTop - paddingTop;
  mirror.remove();
  return Math.max(0, top);
}

