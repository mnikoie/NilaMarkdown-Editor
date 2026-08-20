import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { processHtml, type HtmlMode } from "../core/security.js";

/**
 * HTMLِ خام در سند.
 *
 * ★ بندِ ۱۱: پیش‌فرض `escape` است. اسنادِ این پروژه از فایلِ Word وارد
 * می‌شوند و ممکن است HTMLِ دلخواه داشته باشند؛ رندرِ بی‌فیلترِ آنها یعنی
 * XSS روی هر کسی که سند را باز می‌کند.
 *
 * ★ متنِ اصلی همیشه در `attrs.value` دست‌نخورده می‌ماند — چه رندر شود چه
 * نه. پس رفت‌وبرگشت نمی‌شکند و کاربر محتوایش را از دست نمی‌دهد.
 */
export class HtmlBlockView implements NodeView {
  dom: HTMLElement;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
    private mode: HtmlMode = "escape",
  ) {
    this.dom = document.createElement("div");
    this.dom.className = "tm-html";
    this.render();
  }

  private render() {
    const value = (this.node.attrs.value as string) ?? "";
    this.dom.setAttribute("data-html-mode", this.mode);

    if (this.mode === "escape") {
      // `textContent` و نه `innerHTML` — این خودش تضمینِ امنیت است.
      const pre = document.createElement("pre");
      pre.className = "tm-html-source";
      pre.dir = "ltr";
      pre.textContent = value;
      this.dom.replaceChildren(pre);
      return;
    }

    // `sanitize` و `raw` هر دو `innerHTML` می‌شوند؛ تفاوت در این است که
    // `processHtml` در حالتِ sanitize فیلتر می‌کند.
    this.dom.innerHTML = processHtml(value, this.mode);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    if (node.attrs.value === this.node.attrs.value) return true;
    this.node = node;
    this.render();
    return true;
  }

  /** محتوا را خودمان می‌سازیم — گره atom است. */
  ignoreMutation(): boolean {
    return true;
  }
}
