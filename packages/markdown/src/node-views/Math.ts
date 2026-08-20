import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { importOptional } from "./CodeBlock.js";

/**
 * ریاضیِ بلوکی و درون‌خطی با KaTeX.
 *
 * ★ نبودِ KaTeX = نمایشِ فرمولِ خام، نه خطا. کاربری که ریاضی نمی‌نویسد
 * نباید ۳۰۰ کیلوبایت دانلود کند.
 *
 * گره `atom` است، پس محتوایش قابلِ ویرایشِ مستقیم نیست؛ کلیک روی آن
 * ویرایشگرِ کوچکی باز می‌کند تا کاربر فرمول را عوض کند.
 */

interface Katex {
  renderToString(tex: string, options: { displayMode: boolean; throwOnError: boolean }): string;
}

let katexLoader: Promise<Katex | null> | null = null;

async function loadKatex(): Promise<Katex | null> {
  const mod = await importOptional<{ default?: Katex } & Katex>("katex");
  return mod ? (mod.default ?? mod) : null;
}

function getKatex(): Promise<Katex | null> {
  katexLoader ??= loadKatex();
  return katexLoader;
}

class MathViewBase implements NodeView {
  dom: HTMLElement;
  private destroyed = false;
  private editing = false;
  private input: HTMLTextAreaElement | null = null;

  constructor(
    protected node: PMNode,
    protected view: EditorView,
    protected getPos: () => number | undefined,
    private displayMode: boolean,
  ) {
    this.dom = document.createElement(displayMode ? "div" : "span");
    this.dom.className = displayMode ? "tm-math-block" : "tm-math-inline";
    this.dom.addEventListener("click", (e) => {
      if (this.view.editable && !this.editing) {
        e.preventDefault();
        this.startEditing();
      }
    });
    void this.render();
  }

  private get tex(): string {
    return (this.node.attrs.value as string) ?? "";
  }

  private async render() {
    const tex = this.tex;

    if (!tex) {
      this.dom.textContent = this.displayMode ? "فرمولِ خالی" : "∅";
      this.dom.setAttribute("data-empty", "true");
      return;
    }
    this.dom.removeAttribute("data-empty");

    const katex = await getKatex();
    if (this.destroyed || this.editing) return;

    if (!katex) {
      // KaTeX نیست → متنِ خام با نشانه‌گذاری، تا کاربر بفهمد چرا رندر نشده.
      this.dom.textContent = this.displayMode ? `$$${tex}$$` : `$${tex}$`;
      this.dom.setAttribute("data-rendered", "false");
      return;
    }

    try {
      this.dom.innerHTML = katex.renderToString(tex, {
        displayMode: this.displayMode,
        throwOnError: false,
      });
      this.dom.setAttribute("data-rendered", "true");
    } catch {
      // فرمولِ غلط → خام. سند نباید بشکند.
      this.dom.textContent = this.displayMode ? `$$${tex}$$` : `$${tex}$`;
      this.dom.setAttribute("data-rendered", "false");
    }
  }

  private startEditing() {
    this.editing = true;
    const input = document.createElement("textarea");
    input.className = "tm-math-editor";
    input.value = this.tex;
    input.dir = "ltr";
    input.rows = this.displayMode ? 3 : 1;

    const commit = () => {
      if (!this.editing) return;
      this.editing = false;
      const pos = this.getPos();
      if (pos === undefined) return;
      const value = input.value;
      if (value !== this.tex) {
        this.view.dispatch(
          this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, value }),
        );
      } else {
        void this.render();
      }
      this.input = null;
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey && !this.displayMode)) {
        e.preventDefault();
        commit();
        this.view.focus();
      }
    });

    this.dom.replaceChildren(input);
    this.input = input;
    input.focus();
    input.select();
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (!this.editing) void this.render();
    return true;
  }

  /** رویدادهای داخلِ ویرایشگرِ فرمول به ProseMirror نرسند. */
  stopEvent(event: Event): boolean {
    return this.input?.contains(event.target as Node) ?? false;
  }

  ignoreMutation(): boolean {
    // کلِ محتوا را خودمان مدیریت می‌کنیم — گره atom است.
    return true;
  }

  destroy() {
    this.destroyed = true;
  }
}

export class MathBlockView extends MathViewBase {
  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    super(node, view, getPos, true);
  }
}

export class MathInlineView extends MathViewBase {
  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    super(node, view, getPos, false);
  }
}
