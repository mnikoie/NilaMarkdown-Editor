import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView, ViewMutationRecord } from "prosemirror-view";
import type { MarkDefinition, MarkRegistry } from "../core/directives/types.js";
import type { FoldInitialState, FoldMode } from "../core/plugins/fold.js";

export interface MarkCardOptions {
  initial?: FoldInitialState;
  mode?: FoldMode | (() => FoldMode);
  locale?: "fa" | "en";
}

const cardViews = new WeakMap<EditorView, Set<MarkCardView>>();

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
  private readonly onSetFold = (event: Event) => {
    const open = (event as CustomEvent<{ open?: boolean }>).detail?.open;
    if (typeof open !== "boolean") return;
    this.open = open;
    this.applyOpen();
  };

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
    private registry: MarkRegistry,
    private options: MarkCardOptions = {},
  ) {
    const name = node.attrs.name as string;
    const def = registry[name];

    this.open = options.initial === "collapsed" ? false : (def?.defaultOpen ?? true);

    this.dom = document.createElement("div");
    this.dom.className = "tm-mark";
    this.dom.setAttribute("data-mark", name);

    this.header = document.createElement("div");
    this.header.className = "tm-mark-header";

    this.body = document.createElement("div");
    this.body.className = "tm-mark-body";
    this.contentDOM = this.body;

    this.dom.append(this.header, this.body);
    this.dom.addEventListener("tm-set-fold", this.onSetFold);
    const views = cardViews.get(view) ?? new Set<MarkCardView>();
    views.add(this);
    cardViews.set(view, views);
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

    // هر directive بلوکی مالکِ محتوای زیرمجموعهٔ خودش است؛ پس مستقل از
    // تعریفِ سفارشی‌اش یک نودِ درختی و قابلِ بازوبسته‌شدن محسوب می‌شود.
    if (this.node.childCount > 0) {
      this.toggle = document.createElement("button");
      this.toggle.type = "button";
      this.toggle.className = "tm-fold-toggle";
      this.toggle.setAttribute("aria-expanded", String(this.open));
      this.toggle.setAttribute("aria-label", this.toggleLabel(def?.label ?? name));
      const chevron = document.createElement("span");
      chevron.className = "tm-fold-chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "⌄";
      this.toggle.append(chevron);
      // mousedown پیش از تراکنشِ focus اجرا می‌شود؛ اگر منتظر click بمانیم
      // ProseMirror ممکن است NodeView را میانِ down/up به‌روزرسانی کند.
      this.toggle.addEventListener("mousedown", (e) => {
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
    if (open && this.foldMode() === "accordion") {
      const parent = this.parentNode();
      for (const card of cardViews.get(this.view) ?? []) {
        if (card !== this && card.parentNode() === parent) card.setOpen(false);
      }
    }
    this.open = open;
    this.applyOpen();
  }

  private foldMode(): FoldMode {
    return typeof this.options.mode === "function" ? this.options.mode() : (this.options.mode ?? "accordion");
  }

  private parentNode(): PMNode | null {
    const pos = this.getPos();
    if (typeof pos !== "number") return null;
    return this.view.state.doc.resolve(Math.min(pos, this.view.state.doc.content.size)).parent;
  }

  private toggleLabel(title: string): string {
    if (this.options.locale === "en") return `${this.open ? "Collapse" : "Expand"} ${title}`;
    return `${this.open ? "بستنِ" : "بازکردنِ"} ${title}`;
  }

  private applyOpen() {
    this.body.style.display = this.open ? "" : "none";
    this.toggle?.setAttribute("aria-expanded", String(this.open));
    this.toggle?.setAttribute(
      "aria-label",
      this.toggleLabel(this.node.attrs.name as string),
    );
    this.dom.setAttribute("data-folded", String(!this.open));
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
    return (
      this.header.contains(mutation.target) ||
      (mutation.type === "attributes" && (mutation.target === this.body || mutation.target === this.dom))
    );
  }

  destroy(): void {
    this.dom.removeEventListener("tm-set-fold", this.onSetFold);
    cardViews.get(this.view)?.delete(this);
  }
}

/** سازندهٔ NodeView برای پیکربندیِ `EditorView`. */
export function markCardViews(registry: MarkRegistry, options: MarkCardOptions = {}) {
  return {
    directive_block: (node: PMNode, view: EditorView, getPos: () => number | undefined) =>
      new MarkCardView(node, view, getPos, registry, options),
  };
}
