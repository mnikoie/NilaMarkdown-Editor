"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { EditorView } from "prosemirror-view";
import { getActiveLink, setLink, unsetLink } from "../../core/commands/link.js";
import { useMarkdownI18n } from "../i18n.js";

export interface LinkPopoverProps {
  view: EditorView | null;
  open: boolean;
  onClose: () => void;
}

/** ویرایشِ لینک بدونِ گرفتنِ فوکوس و انتخاب از خودِ سند. */
export function LinkPopover({ view, open, onClose }: LinkPopoverProps) {
  const { t } = useMarkdownI18n();
  const [href, setHref] = useState("");
  const [label, setLabel] = useState("");
  const [hasLink, setHasLink] = useState(false);
  const hrefRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !view) return;
    const active = getActiveLink(view.state);
    setHref(active?.href ?? "");
    setLabel(active?.text ?? view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, ""));
    setHasLink(Boolean(active));
    const timer = setTimeout(() => hrefRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open, view]);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!view || !href.trim()) return;
    setLink(href, label || undefined)(view.state, view.dispatch);
    view.focus();
    onClose();
  };

  const remove = () => {
    if (!view) return;
    unsetLink(view.state, view.dispatch);
    view.focus();
    onClose();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      view?.focus();
      onClose();
    }
  };

  return (
    <form className="tm-link-popover" aria-label={t("ویرایشِ لینک")} onSubmit={submit} onKeyDown={onKeyDown}>
      <label className="tm-link-field">
        <span>{t("متن")}</span>
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t("متنِ لینک")} />
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
        {hasLink ? (
          <button type="button" className="tm-link-remove" onClick={remove}>
            {t("حذفِ لینک")}
          </button>
        ) : null}
        <button type="button" onClick={() => { view?.focus(); onClose(); }}>
          {t("لغو")}
        </button>
        <button type="submit" disabled={!href.trim()}>
          {t("ثبت")}
        </button>
      </div>
    </form>
  );
}
