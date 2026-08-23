import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView, ViewMutationRecord } from "prosemirror-view";
import type { MarkDefinition, MarkRegistry } from "../core/directives/types.js";
import { toggleFoldPreservingScroll } from "../core/plugins/fold.js";
import type { FoldInitialState, FoldMode } from "../core/plugins/fold.js";
import { buildOutline, flattenOutline } from "../core/outline/build.js";
import { preserveScrollAnchor } from "../core/plugins/scroll-anchor.js";

export interface MarkCardOptions {
  initial?: FoldInitialState;
  mode?: FoldMode | (() => FoldMode);
  locale?: "fa" | "en";
}

const cardViews = new WeakMap<EditorView, Set<MarkCardView>>();
const foldIdsByView = new WeakMap<EditorView, {
  doc: PMNode;
  nodes: Map<number, { id: string; depth: number }>;
}>();

function lucideChevron(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.classList.add("tm-fold-chevron");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "m6 9 6 6 6-6");
  svg.append(path);
  return svg;
}

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
  private animationTimer: number | null = null;
  private open: boolean;
  private readonly onSetFold = (event: Event) => {
    const open = (event as CustomEvent<{ open?: boolean }>).detail?.open;
    if (typeof open !== "boolean" || this.open === open) return;
    this.open = open;
    this.applyOpen(true);
  };
  private readonly onHeaderMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || !this.toggle) return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest) return;
    const control = target.closest("button, input, select, textarea, a, [role='button'], [data-no-fold-toggle]");
    if (control && control !== this.header) return;
    event.preventDefault();
    this.setOpen(!this.open);
  };
  private readonly onHeaderKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as HTMLElement | null;
    if (target !== this.header) return;
    event.preventDefault();
    this.setOpen(!this.open);
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
    this.header.addEventListener("mousedown", this.onHeaderMouseDown);
    this.header.addEventListener("keydown", this.onHeaderKeyDown);
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
      this.dom.setAttribute("data-collapsible", "true");
      this.toggle = document.createElement("button");
      this.toggle.type = "button";
      this.toggle.className = "tm-fold-toggle";
      this.toggle.setAttribute("aria-expanded", String(this.open));
      this.toggle.setAttribute("aria-label", this.toggleLabel(def?.label ?? name));
      const chevron = lucideChevron();
      chevron.setAttribute("aria-hidden", "true");
      this.toggle.append(chevron);
      this.toggle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.setOpen(!this.open);
      });
      this.toggle.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        this.setOpen(!this.open);
      });
      this.header.append(this.toggle);
    } else {
      this.dom.removeAttribute("data-collapsible");
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
    //
    // ★ «نوع» هم بیرون است: مقدارِ آن (مثلِ `compiler`) شناسهٔ داخلیِ
    // پایپ‌لاینِ ورود است، نه چیزی که خوانندهٔ سند باید ببیند. نامِ
    // نمایشی از `def.label` می‌آید («یادداشت نویسنده»).
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "شماره" || key === "وضعیت" || key === "#" || key === "نوع") continue;
      const badge = document.createElement("span");
      badge.className = "tm-mark-attr";
      badge.textContent = `${key}: ${value}`;
      this.header.append(badge);
    }

    this.dom.setAttribute("aria-label", `${def?.label ?? name}`);
    const fold = this.foldNode();
    if (fold) {
      this.dom.setAttribute("data-fold-id", fold.id);
      this.dom.setAttribute("data-tree-depth", String(fold.depth));
      this.dom.style.setProperty("--tm-tree-indent", `${fold.depth * 14}px`);
    } else {
      this.dom.removeAttribute("data-fold-id");
      this.dom.removeAttribute("data-tree-depth");
      this.dom.style.removeProperty("--tm-tree-indent");
    }
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

  private setOpen(open: boolean, preserve = true) {
    if (this.open === open) return;
    const change = () => {
      if (open && this.foldMode() === "accordion") {
        const parent = this.parentNode();
        for (const card of cardViews.get(this.view) ?? []) {
          if (card !== this && card.parentNode() === parent) card.setOpen(false, false);
        }
      }
      this.open = open;
      this.applyOpen(true);
      const id = this.foldId();
      const pos = this.getPos();
      if (id && typeof pos === "number") {
        // NodeView مستقیماً منبعِ واحدِ fold را به‌روز می‌کند. تکیه به
        // رویدادِ React باعث می‌شد کارت در بعضی مرورگرها یک‌بار باز و
        // بلافاصله با state قدیمی دوباره بسته شود.
        toggleFoldPreservingScroll(this.view, id, pos);
      }
    };
    if (preserve) preserveScrollAnchor(this.header, change);
    else change();
  }

  private foldId(): string | null {
    return this.foldNode()?.id ?? null;
  }

  private foldNode(): { id: string; depth: number } | null {
    const pos = this.getPos();
    if (typeof pos !== "number") return null;
    const doc = this.view.state.doc;
    let cached = foldIdsByView.get(this.view);
    if (!cached || cached.doc !== doc) {
      cached = {
        doc,
        nodes: new Map(),
      };
      const add = (nodes: ReturnType<typeof buildOutline>, depth: number) => {
        for (const node of nodes) {
          cached!.nodes.set(node.from, { id: node.id, depth });
          add(node.children, depth + 1);
        }
      };
      add(buildOutline(doc, this.registry), 0);
      foldIdsByView.set(this.view, cached);
    }
    return cached.nodes.get(pos) ?? null;
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

  private applyOpen(animate = false) {
    if (this.animationTimer !== null) {
      window.clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = () => {
      this.body.style.removeProperty("block-size");
      this.body.style.removeProperty("overflow");
      this.body.style.removeProperty("transition");
      this.body.style.removeProperty("opacity");
      if (!this.open) this.body.style.display = "none";
    };

    if (!animate || reduced || !this.body.isConnected) {
      this.body.style.display = this.open ? "" : "none";
      this.body.style.removeProperty("block-size");
      this.body.style.removeProperty("overflow");
      this.body.style.removeProperty("transition");
    } else if (this.open) {
      this.body.style.display = "";
      this.body.style.overflow = "hidden";
      this.body.style.blockSize = "0px";
      const height = this.body.scrollHeight;
      requestAnimationFrame(() => {
        this.body.style.transition = "block-size 180ms ease, opacity 160ms ease";
        this.body.style.opacity = "1";
        this.body.style.blockSize = `${height}px`;
      });
      this.animationTimer = window.setTimeout(() => {
        this.animationTimer = null;
        finish();
      }, 210);
    } else {
      const height = this.body.getBoundingClientRect().height;
      // jsdom layout ندارد؛ در مرورگرِ واقعی height مثبت است و transition
      // اجرا می‌شود. در محیطِ بی‌layout باید فوراً به حالت نهایی برسیم.
      if (height <= 0) {
        this.body.style.display = "none";
        this.body.style.removeProperty("block-size");
        this.body.style.removeProperty("overflow");
        this.body.style.removeProperty("transition");
        this.body.style.removeProperty("opacity");
        this.toggle?.setAttribute("aria-expanded", String(this.open));
        this.dom.setAttribute("data-folded", String(!this.open));
        return;
      }
      this.body.style.overflow = "hidden";
      this.body.style.blockSize = `${height}px`;
      requestAnimationFrame(() => {
        this.body.style.transition = "block-size 180ms ease, opacity 140ms ease";
        this.body.style.opacity = "0";
        this.body.style.blockSize = "0px";
      });
      this.animationTimer = window.setTimeout(() => {
        this.animationTimer = null;
        finish();
      }, 210);
    }
    this.toggle?.setAttribute("aria-expanded", String(this.open));
    this.toggle?.setAttribute("aria-label", this.toggleLabel(this.node.attrs.name as string));
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
    if (this.animationTimer !== null) window.clearTimeout(this.animationTimer);
    this.dom.removeEventListener("tm-set-fold", this.onSetFold);
    this.header.removeEventListener("mousedown", this.onHeaderMouseDown);
    this.header.removeEventListener("keydown", this.onHeaderKeyDown);
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
