import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView, ViewMutationRecord } from "prosemirror-view";
import { isRealBrowser, importOptional } from "./CodeBlock.js";

/**
 * نمودارِ Mermaid — از بلوکِ کد با زبانِ `mermaid`.
 *
 * ★ امنیت (بندِ ۱۱): Mermaid می‌تواند کدِ دلخواه اجرا کند.
 * `securityLevel: "strict"` اجباری است و اگر محتوا از بیرون بیاید،
 * مصرف‌کننده باید بتواند کلاً خاموشش کند.
 *
 * ★ نبودِ Mermaid = کدِ خام. چند صد کیلوبایت است و نباید به کسی که
 * نمودار نمی‌کشد تحمیل شود.
 */

interface Mermaid {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string }>;
}

let mermaidLoader: Promise<Mermaid | null> | null = null;
let counter = 0;

async function loadMermaid(): Promise<Mermaid | null> {
  // Mermaid به Canvas و اندازه‌گیریِ متن نیاز دارد — در jsdom بارگذاری‌اش
  // پروسه را می‌کُشد. آنجا مثلِ «نصب‌نبودن» رفتار می‌کند: کدِ خام.
  if (!isRealBrowser()) return null;
  try {
    const mod = await importOptional<{ default?: Mermaid } & Mermaid>("mermaid");
    if (!mod) return null;
    const mermaid = mod.default ?? mod;
    mermaid.initialize({
      startOnLoad: false,
      // اجباری — نه گزینه.
      securityLevel: "strict",
      theme: "default",
    });
    return mermaid;
  } catch {
    return null;
  }
}

function getMermaid(): Promise<Mermaid | null> {
  mermaidLoader ??= loadMermaid();
  return mermaidLoader;
}

export class MermaidView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;

  private preview: HTMLElement;
  private pre: HTMLPreElement;
  private showSource = false;
  private destroyed = false;
  private toggle: HTMLButtonElement;
  private controls: HTMLElement;
  private scale = 1;
  private panX = 0;
  private panY = 0;
  private drag: { x: number; y: number; panX: number; panY: number } | null = null;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
    private enabled: boolean,
    private locale: "fa" | "en" = "fa",
  ) {
    this.dom = document.createElement("div");
    this.dom.className = "tm-mermaid";

    const header = document.createElement("div");
    header.className = "tm-code-header";
    header.contentEditable = "false";

    const label = document.createElement("span");
    label.className = "tm-code-lang";
    label.textContent = this.locale === "en" ? "Diagram" : "نمودار";

    this.toggle = document.createElement("button");
    this.toggle.type = "button";
    this.toggle.className = "tm-code-copy";
    this.toggle.textContent = this.locale === "en" ? "Show Code" : "نمایشِ کد";
    this.toggle.addEventListener("click", (e) => {
      e.preventDefault();
      this.showSource = !this.showSource;
      this.applyMode();
    });

    this.controls = document.createElement("span");
    this.controls.className = "tm-mermaid-controls";
    for (const [labelText, titleText, delta] of [
      ["−", this.locale === "en" ? "Zoom out" : "کوچک‌نمایی", -0.1],
      ["۱:۱", this.locale === "en" ? "Reset view" : "بازنشانی نما", 0],
      ["+", this.locale === "en" ? "Zoom in" : "بزرگ‌نمایی", 0.1],
    ] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tm-code-copy";
      button.textContent = labelText;
      button.title = titleText;
      button.setAttribute("aria-label", titleText);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        if (delta === 0) {
          this.scale = 1;
          this.panX = 0;
          this.panY = 0;
        } else {
          this.scale = Math.min(3, Math.max(0.4, this.scale + delta));
        }
        this.applyTransform();
      });
      this.controls.append(button);
    }

    const actions = document.createElement("span");
    actions.className = "tm-mermaid-actions";
    actions.append(this.controls, this.toggle);
    header.append(label, actions);

    this.preview = document.createElement("div");
    this.preview.className = "tm-mermaid-preview";
    this.preview.contentEditable = "false";
    this.preview.title = this.locale === "en"
      ? "Shift + mouse wheel to zoom; drag to pan; drag the lower edge to resize"
      : "برای بزرگ‌نمایی Shift و چرخ ماوس؛ برای جابه‌جایی، نمودار را بکشید؛ برای تغییر ارتفاع، لبه پایین را بکشید";
    this.preview.addEventListener("wheel", this.onWheel, { passive: false });
    this.preview.addEventListener("pointerdown", this.onPointerDown);
    this.preview.addEventListener("pointermove", this.onPointerMove);
    this.preview.addEventListener("pointerup", this.onPointerUp);
    this.preview.addEventListener("pointercancel", this.onPointerUp);

    this.pre = document.createElement("pre");
    const code = document.createElement("code");
    this.pre.append(code);
    this.contentDOM = code;

    this.dom.append(header, this.preview, this.pre);
    this.applyMode();
    void this.render();
  }

  private applyMode() {
    this.pre.style.display = this.showSource ? "" : "none";
    this.preview.style.display = this.showSource ? "none" : "";
    this.toggle.textContent = this.locale === "en"
      ? (this.showSource ? "Show Diagram" : "Show Code")
      : (this.showSource ? "نمایشِ نمودار" : "نمایشِ کد");
  }

  private applyTransform() {
    const svg = this.preview.querySelector<SVGElement>("svg");
    if (!svg) return;
    svg.style.transformOrigin = "center center";
    svg.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
  }

  private onWheel = (event: WheelEvent) => {
    if (!event.shiftKey || this.showSource) return;
    event.preventDefault();
    this.scale = Math.min(3, Math.max(0.4, this.scale + (event.deltaY < 0 ? 0.1 : -0.1)));
    this.applyTransform();
  };

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.showSource || !this.preview.querySelector("svg")) return;
    this.drag = { x: event.clientX, y: event.clientY, panX: this.panX, panY: this.panY };
    this.preview.setPointerCapture(event.pointerId);
    this.preview.dataset.panning = "true";
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.drag) return;
    this.panX = this.drag.panX + event.clientX - this.drag.x;
    this.panY = this.drag.panY + event.clientY - this.drag.y;
    this.applyTransform();
  };

  private onPointerUp = (event: PointerEvent) => {
    if (!this.drag) return;
    this.drag = null;
    this.preview.dataset.panning = "false";
    if (this.preview.hasPointerCapture(event.pointerId)) this.preview.releasePointerCapture(event.pointerId);
  };

  private async render() {
    const text = this.node.textContent;

    if (!this.enabled) {
      this.preview.textContent = this.locale === "en" ? "Diagram is disabled." : "نمودار خاموش است.";
      this.dom.setAttribute("data-rendered", "off");
      // وقتی خاموش است، کد را نشان بده تا محتوا گم نشود.
      this.showSource = true;
      this.applyMode();
      return;
    }

    if (!text.trim()) {
      this.preview.textContent = this.locale === "en" ? "Empty diagram" : "نمودارِ خالی";
      return;
    }

    const mermaid = await getMermaid();
    if (this.destroyed) return;

    if (!mermaid) {
      this.dom.setAttribute("data-rendered", "false");
      this.showSource = true;
      this.applyMode();
      return;
    }

    try {
      const { svg } = await mermaid.render(`tm-mermaid-${counter++}`, text);
      if (this.destroyed) return;
      this.preview.innerHTML = svg;
      this.dom.setAttribute("data-rendered", "true");
      this.applyTransform();
    } catch (err) {
      if (this.destroyed) return;
      // نحوِ غلط → پیامِ خطا کنارِ کد، نه صفحهٔ سفید.
      this.preview.textContent = this.locale === "en"
        ? `Could not render diagram: ${(err as Error).message}`
        : `نمودار رندر نشد: ${(err as Error).message}`;
      this.dom.setAttribute("data-rendered", "false");
    }
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    if (node.attrs.language !== "mermaid") return false;
    const changed = node.textContent !== this.node.textContent;
    this.node = node;
    if (changed) void this.render();
    return true;
  }

  stopEvent(event: Event): boolean {
    return this.toggle.contains(event.target as Node) || this.controls.contains(event.target as Node) || this.preview.contains(event.target as Node);
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return this.preview.contains(mutation.target);
  }

  destroy() {
    this.destroyed = true;
    this.preview.removeEventListener("wheel", this.onWheel);
    this.preview.removeEventListener("pointerdown", this.onPointerDown);
    this.preview.removeEventListener("pointermove", this.onPointerMove);
    this.preview.removeEventListener("pointerup", this.onPointerUp);
    this.preview.removeEventListener("pointercancel", this.onPointerUp);
  }
}
