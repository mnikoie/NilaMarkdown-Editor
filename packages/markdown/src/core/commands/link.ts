import type { Mark } from "prosemirror-model";
import type { Command, EditorState } from "prosemirror-state";
import { schema } from "../schema/index.js";

export interface ActiveLink {
  href: string;
  title: string | null;
  from: number;
  to: number;
  text: string;
}

function linkAt(state: EditorState): Mark | null {
  const { $from, empty } = state.selection;
  if (empty) {
    return schema.marks.link.isInSet(state.storedMarks ?? $from.marks()) ?? null;
  }
  let found: Mark | null = null;
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node) => {
    if (found || !node.isText) return;
    found = schema.marks.link.isInSet(node.marks) ?? null;
  });
  return found;
}

/** لینکِ زیرِ مکان‌نما یا روی انتخاب، همراه با بازهٔ کاملِ آن. */
export function getActiveLink(state: EditorState): ActiveLink | null {
  const mark = linkAt(state);
  if (!mark) return null;

  let from = state.selection.from;
  let to = state.selection.to;
  if (state.selection.empty) {
    const parent = state.selection.$from.parent;
    const parentStart = state.selection.$from.start();
    const offset = state.selection.$from.parentOffset;

    let before = offset;
    let after = offset;
    const segments: Array<{ from: number; to: number; matches: boolean }> = [];
    parent.forEach((child, childOffset) => {
      const childLink = child.isText ? schema.marks.link.isInSet(child.marks) : null;
      segments.push({
        from: childOffset,
        to: childOffset + child.nodeSize,
        matches: Boolean(childLink?.eq(mark)),
      });
    });

    // یک لینک ممکن است به‌خاطرِ bold/italic به چند text-node شکسته
    // باشد؛ همهٔ قطعه‌های پیوسته با همان mark را در بازه می‌آوریم.
    const index = segments.findIndex(
      (segment) => segment.matches && segment.from <= offset && segment.to >= offset,
    );
    if (index >= 0) {
      let first = index;
      let last = index;
      while (first > 0 && segments[first - 1]!.matches && segments[first - 1]!.to === segments[first]!.from) first--;
      while (
        last + 1 < segments.length &&
        segments[last + 1]!.matches &&
        segments[last]!.to === segments[last + 1]!.from
      ) last++;
      before = segments[first]!.from;
      after = segments[last]!.to;
    }
    from = parentStart + before;
    to = parentStart + after;
  }

  return {
    href: String(mark.attrs.href ?? ""),
    title: mark.attrs.title ? String(mark.attrs.title) : null,
    from,
    to,
    text: state.doc.textBetween(from, to, ""),
  };
}

/** ساخت یا ویرایشِ لینک؛ انتخابِ خالی با `label` یک لینکِ تازه درج می‌کند. */
export function setLink(href: string, label?: string, title: string | null = null): Command {
  return (state, dispatch) => {
    const cleanHref = href.trim();
    if (!cleanHref) return false;

    const active = getActiveLink(state);
    const from = active?.from ?? state.selection.from;
    const to = active?.to ?? state.selection.to;
    const text = label?.trim() || active?.text || state.doc.textBetween(from, to, "") || cleanHref;
    const mark = schema.marks.link.create({ href: cleanHref, title });

    if (!dispatch) return true;
    const tr = state.tr;
    if (from === to) {
      tr.insertText(text, from, to);
      tr.addMark(from, from + text.length, mark);
    } else if (label !== undefined && text !== state.doc.textBetween(from, to, "")) {
      tr.replaceWith(from, to, schema.text(text, [mark]));
    } else {
      tr.removeMark(from, to, schema.marks.link).addMark(from, to, mark);
    }
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/** حذفِ لینک، بی حذفِ متن. */
export const unsetLink: Command = (state, dispatch) => {
  const active = getActiveLink(state);
  const from = active?.from ?? state.selection.from;
  const to = active?.to ?? state.selection.to;
  if (from === to) return false;
  dispatch?.(state.tr.removeMark(from, to, schema.marks.link));
  return true;
};

/** لینکِ reference-style را همراه با definition آن در انتهای سند می‌سازد. */
export function setReferenceLink(
  identifier: string,
  href: string,
  label?: string,
  title: string | null = null,
): Command {
  return (state, dispatch) => {
    const cleanIdentifier = identifier.trim().replace(/\s+/g, "-");
    const cleanHref = href.trim();
    if (!cleanIdentifier || !cleanHref) return false;

    let definitionPos: number | null = null;
    state.doc.descendants((node, pos) => {
      if (
        definitionPos === null &&
        node.type === schema.nodes.link_definition &&
        String(node.attrs.identifier).toLowerCase() === cleanIdentifier.toLowerCase()
      ) {
        definitionPos = pos;
      }
    });

    if (!dispatch) return true;
    const { from, to } = state.selection;
    const text = label?.trim() || state.doc.textBetween(from, to, "") || cleanIdentifier;
    const mark = schema.marks.link.create({
      href: cleanHref,
      title,
      identifier: cleanIdentifier,
      referenceType: "full",
    });
    const tr = state.tr;
    if (from === to) {
      tr.insertText(text, from);
      tr.addMark(from, from + text.length, mark);
    } else if (text !== state.doc.textBetween(from, to, "")) {
      tr.replaceWith(from, to, schema.text(text, [mark]));
    } else {
      tr.removeMark(from, to, schema.marks.link).addMark(from, to, mark);
    }

    const attrs = { identifier: cleanIdentifier, url: cleanHref, title };
    if (definitionPos !== null) {
      tr.setNodeMarkup(tr.mapping.map(definitionPos), schema.nodes.link_definition, attrs);
    } else {
      tr.insert(tr.doc.content.size, schema.nodes.link_definition.create(attrs));
    }
    dispatch(tr.scrollIntoView());
    return true;
  };
}
