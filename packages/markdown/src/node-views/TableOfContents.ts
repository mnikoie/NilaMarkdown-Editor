import { TextSelection } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { schema } from "../core/schema/index.js";

/** نمایشِ زندهٔ `[TOC]` از روی سرفصل‌های همان سند. */
export class TableOfContentsView implements NodeView {
  dom: HTMLElement;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private locale: "fa" | "en" = "fa",
  ) {
    this.dom = document.createElement("nav");
    this.dom.className = "tm-toc";
    this.dom.contentEditable = "false";
    this.dom.setAttribute("aria-label", this.locale === "en" ? "Table of Contents" : "فهرست مطالب");
    this.render();
  }

  private render() {
    const title = document.createElement("strong");
    title.className = "tm-toc-title";
    title.textContent = this.locale === "en" ? "Table of Contents" : "فهرست مطالب";
    const list = document.createElement("ol");
    list.className = "tm-toc-list";

    this.view.state.doc.descendants((node, pos) => {
      if (node.type !== schema.nodes.heading) return true;
      const item = document.createElement("li");
      item.style.setProperty("--tm-toc-level", String(node.attrs.level));
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = node.textContent || (this.locale === "en" ? "Untitled heading" : "سرفصلِ بی‌نام");
      button.addEventListener("click", () => {
        const current = this.view.state.doc.nodeAt(pos);
        if (current?.type !== schema.nodes.heading) return;
        const selection = TextSelection.near(this.view.state.doc.resolve(pos + 1), 1);
        this.view.dispatch(this.view.state.tr.setSelection(selection).scrollIntoView());
        this.view.focus();
      });
      item.append(button);
      list.append(item);
      return false;
    });

    if (!list.childElementCount) {
      const empty = document.createElement("p");
      empty.className = "tm-toc-empty";
      empty.textContent = this.locale === "en" ? "No headings yet." : "هنوز سرفصلی نیست.";
      this.dom.replaceChildren(title, empty);
      return;
    }
    this.dom.replaceChildren(title, list);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  stopEvent(event: Event): boolean {
    return this.dom.contains(event.target as Node);
  }

  ignoreMutation(): boolean {
    return true;
  }
}
