import type { Node as PMNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";

/** نمایش و ویرایشِ تعریفِ لینکِ reference-style. */
export class LinkDefinitionView implements NodeView {
  dom: HTMLElement;
  private editing = false;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
    private locale: "fa" | "en" = "fa",
  ) {
    this.dom = document.createElement("div");
    this.dom.className = "tm-link-definition";
    this.dom.contentEditable = "false";
    this.render();
  }

  private render() {
    this.editing = false;
    const id = String(this.node.attrs.identifier ?? "link");
    const url = String(this.node.attrs.url ?? "");
    const code = document.createElement("code");
    code.dir = "ltr";
    code.textContent = `[${id}]: ${url}`;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = this.locale === "en" ? "Edit" : "ویرایش";
    edit.addEventListener("click", () => this.startEditing());
    this.dom.replaceChildren(code, edit);
  }

  private startEditing() {
    if (!this.view.editable || this.editing) return;
    this.editing = true;
    const form = document.createElement("form");
    const id = document.createElement("input");
    id.value = String(this.node.attrs.identifier ?? "link");
    id.setAttribute("aria-label", this.locale === "en" ? "Reference identifier" : "شناسهٔ ارجاع");
    const url = document.createElement("input");
    url.value = String(this.node.attrs.url ?? "");
    url.dir = "ltr";
    url.setAttribute("aria-label", this.locale === "en" ? "Reference URL" : "نشانیِ ارجاع");
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = this.locale === "en" ? "Apply" : "ثبت";
    form.append(id, url, save);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const pos = this.getPos();
      if (pos === undefined || !id.value.trim() || !url.value.trim()) return;
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, undefined, {
          ...this.node.attrs,
          identifier: id.value.trim().replace(/\s+/g, "-"),
          url: url.value.trim(),
        }),
      );
      this.view.focus();
    });
    form.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.render();
      this.view.focus();
    });
    this.dom.replaceChildren(form);
    id.focus();
    id.select();
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (!this.editing) this.render();
    return true;
  }

  stopEvent(event: Event): boolean {
    return this.dom.contains(event.target as Node);
  }

  ignoreMutation(): boolean {
    return true;
  }
}
