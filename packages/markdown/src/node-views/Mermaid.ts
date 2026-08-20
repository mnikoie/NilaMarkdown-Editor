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

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
    private enabled: boolean,
  ) {
    this.dom = document.createElement("div");
    this.dom.className = "tm-mermaid";

    const header = document.createElement("div");
    header.className = "tm-code-header";
    header.contentEditable = "false";

    const label = document.createElement("span");
    label.className = "tm-code-lang";
    label.textContent = "نمودار";

    this.toggle = document.createElement("button");
    this.toggle.type = "button";
    this.toggle.className = "tm-code-copy";
    this.toggle.textContent = "نمایشِ کد";
    this.toggle.addEventListener("click", (e) => {
      e.preventDefault();
      this.showSource = !this.showSource;
      this.applyMode();
    });

    header.append(label, this.toggle);

    this.preview = document.createElement("div");
    this.preview.className = "tm-mermaid-preview";
    this.preview.contentEditable = "false";

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
    this.toggle.textContent = this.showSource ? "نمایشِ نمودار" : "نمایشِ کد";
  }

  private async render() {
    const text = this.node.textContent;

    if (!this.enabled) {
      this.preview.textContent = "نمودار خاموش است.";
      this.dom.setAttribute("data-rendered", "off");
      // وقتی خاموش است، کد را نشان بده تا محتوا گم نشود.
      this.showSource = true;
      this.applyMode();
      return;
    }

    if (!text.trim()) {
      this.preview.textContent = "نمودارِ خالی";
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
    } catch (err) {
      if (this.destroyed) return;
      // نحوِ غلط → پیامِ خطا کنارِ کد، نه صفحهٔ سفید.
      this.preview.textContent = `نمودار رندر نشد: ${(err as Error).message}`;
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
    return this.toggle.contains(event.target as Node);
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return this.preview.contains(mutation.target);
  }

  destroy() {
    this.destroyed = true;
  }
}
