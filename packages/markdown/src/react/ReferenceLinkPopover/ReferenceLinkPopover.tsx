"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { EditorView } from "prosemirror-view";
import { setReferenceLink } from "../../core/commands/link.js";
import { useMarkdownI18n } from "../i18n.js";

export interface ReferenceLinkPopoverProps {
  view: EditorView | null;
  open: boolean;
  onClose: () => void;
}

function identifierFrom(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "") || "link"
  );
}

/** ساختِ لینکِ reference-style و definition آن در یک مرحله. */
export function ReferenceLinkPopover({ view, open, onClose }: ReferenceLinkPopoverProps) {
  const { t } = useMarkdownI18n();
  const [label, setLabel] = useState("");
  const [identifier, setIdentifier] = useState("link");
  const [href, setHref] = useState("");
  const hrefRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !view) return;
    const selected = view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, "");
    setLabel(selected);
    setIdentifier(identifierFrom(selected));
    setHref("");
    const timer = setTimeout(() => hrefRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open, view]);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!view || !identifier.trim() || !href.trim()) return;
    setReferenceLink(identifier, href, label || undefined)(view.state, view.dispatch);
    view.focus();
    onClose();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    view?.focus();
    onClose();
  };

  return (
    <form
      className="tm-link-popover tm-reference-popover"
      aria-label={t("درجِ ارجاعِ لینک")}
      onSubmit={submit}
      onKeyDown={onKeyDown}
    >
      <label className="tm-link-field">
        <span>{t("متن")}</span>
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t("متنِ لینک")} />
      </label>
      <label className="tm-link-field">
        <span>{t("شناسه")}</span>
        <input
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder="reference-id"
          dir="ltr"
        />
      </label>
      <label className="tm-link-field">
        <span>{t("نشانی")}</span>
        <input
          ref={hrefRef}
          value={href}
          onChange={(event) => setHref(event.target.value)}
          placeholder="https://…"
          dir="ltr"
          inputMode="url"
        />
      </label>
      <div className="tm-link-actions">
        <button type="button" onClick={() => { view?.focus(); onClose(); }}>
          {t("لغو")}
        </button>
        <button type="submit" disabled={!identifier.trim() || !href.trim()}>
          {t("ثبت")}
        </button>
      </div>
    </form>
  );
}
