import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView, ViewMutationRecord } from "prosemirror-view";
import type { MarkDefinition, MarkRegistry } from "../core/directives/types.js";

/**
 * رندرِ یک directive به‌صورتِ کارت.
 *
 * ★ قاعدهٔ بندِ ۱۸: مارکِ ناشناخته **نه خطا می‌دهد نه حذف می‌شود**. اگر
 * تعریفی نباشد، کارتِ خنثی با نامِ خودش رندر می‌شود و صفاتش دست‌نخورده در
 * سند می‌مانند. سندِ کاربر نباید با نبودنِ یک تعریف بشکند.
 *
 * این NodeView است نه کامپوننتِ React: ProseMirror باید مالکِ DOM باشد.
 * اگر React وسط بیاید، هر رندر مکان‌نما را می‌پراند.
 */
export class MarkCardView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;

  private header: HTMLElement;
  private body: HTMLElement;
  private toggle: HTMLButtonElement | null = null;
  private open: boolean;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
    private registry: MarkRegistry,
  ) {
    const name = node.attrs.name as string;
    const def = registry[name];

    this.open = def?.defaultOpen ?? true;

    this.dom = document.createElement("div");
    this.dom.className = "tm-mark";
    this.dom.setAttribute("data-mark", name);

    this.header = document.createElement("div");
    this.header.className = "tm-mark-header";

    this.body = document.createElement("div");
    this.body.className = "tm-mark-body";
    this.contentDOM = this.body;

    this.dom.append(this.header, this.body);
    this.render(def);
  }

  private render(def: MarkDefinition | undefined) {
    const name = this.node.attrs.name as string;
    const attrs = (this.node.attrs.attributes ?? {}) as Record<string, string>;

    this.dom.setAttribute("data-variant", def?.variant ?? "نوار");
    if (def?.counter) this.dom.setAttribute("data-counter", "true");

    // رنگِ پایه — بقیهٔ رنگ‌ها در CSS با color-mix ساخته می‌شوند.
    if (def?.color) this.dom.style.setProperty("--tm-mark-base", def.color);
    else this.dom.style.removeProperty("--tm-mark-base");

    const status = attrs["وضعیت"];
    if (status) this.dom.setAttribute("data-status", status);

    // مارکِ ناشناخته — نشانه‌گذاری می‌شود تا کاربر بفهمد تعریفش نیست،
    // ولی محتوایش کامل نمایش داده می‌شود.
    if (!def) this.dom.setAttribute("data-unknown", "true");

    this.header.replaceChildren();

    if (def?.collapsible) {
      this.toggle = document.createElement("button");
      this.toggle.type = "button";
      this.toggle.className = "tm-fold-toggle";
      this.toggle.setAttribute("aria-expanded", String(this.open));
      const chevron = document.createElement("span");
      chevron.className = "tm-fold-chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "⌄";
      this.toggle.append(chevron);
      this.toggle.addEventListener("click", (e) => {
        e.preventDefault();
        this.setOpen(!this.open);
      });
      this.header.append(this.toggle);
    } else {
      this.toggle = null;
    }

    if (def?.icon) {
      const icon = document.createElement("span");
      icon.className = "tm-mark-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = def.icon;
      this.header.append(icon);
    }

    const title = document.createElement("span");
    title.className = "tm-mark-title";
    title.textContent = this.titleText(def, attrs);
    this.header.append(title);

    // صفاتِ نمایشی، بی «شماره» و «وضعیت» که جای خودشان را دارند.
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "شماره" || key === "وضعیت" || key === "#") continue;
      const badge = document.createElement("span");
      badge.className = "tm-mark-attr";
      badge.textContent = `${key}: ${value}`;
      this.header.append(badge);
    }

    this.dom.setAttribute("aria-label", `${def?.label ?? name}`);
    this.applyOpen();
  }

  private titleText(def: MarkDefinition | undefined, attrs: Record<string, string>): string {
    const name = this.node.attrs.name as string;
    const label = this.node.attrs.label as string | null;
    const base = def?.label ?? name;

    switch (def?.titleFrom) {
      case "متن-تگ":
        if (label) return attrs["شماره"] ? `${base} ${attrs["شماره"]}: ${label}` : `${base}: ${label}`;
        return attrs["شماره"] ? `${base} ${attrs["شماره"]}` : base;
      case "خطِ اول":
        return this.node.firstChild?.textContent?.slice(0, 60) || base;
      default:
        return attrs["شماره"] ? `${base} ${attrs["شماره"]}` : base;
    }
  }

  private setOpen(open: boolean) {
    this.open = open;
    this.applyOpen();
  }

  private applyOpen() {
    this.body.style.display = this.open ? "" : "none";
    this.toggle?.setAttribute("aria-expanded", String(this.open));
  }

  /**
   * وقتی صفات عوض می‌شوند، همان DOM به‌روزرسانی می‌شود نه اینکه از نو
   * ساخته شود — بازسازی، مکان‌نمای داخلِ کارت را می‌پراند.
   */
  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    if (node.attrs.name !== this.node.attrs.name) return false;
    this.node = node;
    this.render(this.registry[node.attrs.name as string]);
    return true;
  }

  /** کلیک روی هدر نباید مکان‌نما را جابه‌جا کند. */
  stopEvent(event: Event): boolean {
    return this.header.contains(event.target as Node);
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return this.header.contains(mutation.target);
  }
}

/** سازندهٔ NodeView برای پیکربندیِ `EditorView`. */
export function markCardViews(registry: MarkRegistry) {
  return {
    directive_block: (node: PMNode, view: EditorView, getPos: () => number | undefined) =>
      new MarkCardView(node, view, getPos, registry),
  };
}
