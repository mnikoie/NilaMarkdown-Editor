import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import type { MarkRegistry } from "../core/directives/types.js";

/**
 * مارکِ درون‌خطی (`:ref[…]{…}`) با حبابِ توضیح.
 *
 * ★ چرا NodeView و نه فقط CSS:
 * `toDOM`ِ گره فقط `data-directive-inline` را بیرون می‌دهد و صفاتِ
 * `{نوع=… هدف=… مصوب=…}` در DOM نمی‌آیند. بدون آنها حباب چیزی برای
 * نشان‌دادن ندارد. اینجا صفات خوانده و روی عنصر نوشته می‌شوند.
 *
 * ★ حباب با JS جای‌گذاری می‌شود، نه `position:absolute`ِ ساده:
 * سند داخلِ `.tm-main` با `overflow-y:auto` است؛ حبابِ absolute در
 * ارجاع‌های نزدیکِ لبه بریده می‌شد. `position:fixed` + محاسبهٔ مختصات
 * این را حل می‌کند.
 *
 * ★ `contentEditable` دست‌نخورده می‌ماند: متنِ داخلِ ارجاع باید مثلِ
 * بقیهٔ متن قابلِ ویرایش بماند، پس `contentDOM` برمی‌گردانیم.
 */
export class InlineDirectiveView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private tip: HTMLElement | null = null;
  private hideTimer: number | null = null;

  constructor(
    private node: PMNode,
    _view: EditorView,
    _getPos: () => number | undefined,
    private registry: MarkRegistry,
  ) {
    const name = String(this.node.attrs.name ?? "");
    const span = document.createElement("span");
    span.className = "tm-directive-inline";
    span.setAttribute("data-directive-inline", name);

    const def = this.registry[name];
    if (def?.variant) span.setAttribute("data-variant", def.variant);
    if (def?.color) span.style.setProperty("--tm-mark-base", def.color);

    const attrs = this.attributes();
    // `هدف` روی خودِ عنصر می‌نشیند تا CSS بتواند حالتِ «ارجاعِ دارای مقصد»
    // را از ارجاعِ بی‌مقصد جدا کند.
    if (attrs["هدف"]) span.setAttribute("data-target", attrs["هدف"]);
    if (attrs["نوع"]) span.setAttribute("data-kind", attrs["نوع"]);

    if (Object.keys(attrs).length > 0) {
      span.tabIndex = 0;
      span.setAttribute("role", "button");
      span.setAttribute("aria-label", this.summary(attrs));
      span.addEventListener("mouseenter", this.show);
      span.addEventListener("mouseleave", this.scheduleHide);
      span.addEventListener("focus", this.show);
      span.addEventListener("blur", this.scheduleHide);
      span.addEventListener("keydown", this.onKey);
    }

    this.dom = span;
    this.contentDOM = span;
  }

  /** صفاتِ گره، بدونِ مقادیرِ خالی. */
  private attributes(): Record<string, string> {
    const raw = (this.node.attrs.attributes ?? {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      const s = String(v ?? "").trim();
      if (s) out[k] = s;
    }
    return out;
  }

  private summary(attrs: Record<string, string>): string {
    return Object.entries(attrs)
      .map(([k, v]) => `${k}: ${v}`)
      .join("، ");
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.tip) {
      e.stopPropagation();
      this.hide();
    }
  };

  private show = () => {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.tip) return;

    const attrs = this.attributes();
    if (Object.keys(attrs).length === 0) return;

    const tip = document.createElement("div");
    tip.className = "tm-ref-tip";
    tip.setAttribute("role", "tooltip");
    tip.dir = "rtl";

    const dl = document.createElement("dl");
    dl.className = "tm-ref-tip-attrs";
    // ترتیبِ ثابت و معنادار؛ صفاتِ ناشناخته بعد از اینها می‌آیند.
    const order = ["نوع", "هدف", "مصوب", "مورخ", "شماره", "مرجع"];
    const seen = new Set<string>();
    const put = (k: string) => {
      const v = attrs[k];
      if (!v || seen.has(k)) return;
      seen.add(k);
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      dl.append(dt, dd);
    };
    for (const k of order) put(k);
    for (const k of Object.keys(attrs)) put(k);
    if (dl.childElementCount > 0) tip.append(dl);

    document.body.append(tip);
    this.tip = tip;
    this.position();
  };

  /** حباب را زیرِ ارجاع می‌گذارد و در صورتِ نبودِ جا، بالای آن. */
  private position() {
    const tip = this.tip;
    if (!tip) return;
    const r = this.dom.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const gap = 8;
    const pad = 8;

    let top = r.bottom + gap;
    if (top + t.height > window.innerHeight - pad) {
      const above = r.top - gap - t.height;
      if (above >= pad) top = above;
      else top = Math.max(pad, window.innerHeight - pad - t.height);
    }

    // راست‌چین: لبهٔ راستِ حباب با لبهٔ راستِ ارجاع هم‌تراز می‌شود.
    let left = r.right - t.width;
    left = Math.min(left, window.innerWidth - pad - t.width);
    left = Math.max(pad, left);

    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
    tip.setAttribute("data-visible", "true");
  }

  /** تأخیرِ کوتاه تا حرکتِ ماوس بینِ ارجاع و حباب آن را نبندد. */
  private scheduleHide = () => {
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(this.hide, 120);
  };

  private hide = () => {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.tip?.remove();
    this.tip = null;
  };

  /** صفات که عوض شوند، گره باید از نو ساخته شود تا حباب کهنه نماند. */
  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    if (node.attrs.name !== this.node.attrs.name) return false;
    const a = JSON.stringify(node.attrs.attributes ?? {});
    const b = JSON.stringify(this.node.attrs.attributes ?? {});
    if (a !== b) return false;
    this.node = node;
    return true;
  }

  /** `ViewMutationRecord` اجتماعِ `MutationRecord` و رکوردِ انتخاب است،
   * پس نوعش از خودِ ProseMirror گرفته می‌شود نه DOM. */
  ignoreMutation(m: Parameters<NonNullable<NodeView["ignoreMutation"]>>[0]) {
    // حباب بیرونِ `dom` است، ولی تغییرِ صفاتِ خودِ span نباید ProseMirror
    // را وادار به بازخوانیِ محتوا کند.
    return m.type === "attributes";
  }

  destroy() {
    this.hide();
    this.dom.removeEventListener("mouseenter", this.show);
    this.dom.removeEventListener("mouseleave", this.scheduleHide);
    this.dom.removeEventListener("focus", this.show);
    this.dom.removeEventListener("blur", this.scheduleHide);
    this.dom.removeEventListener("keydown", this.onKey);
  }
}
