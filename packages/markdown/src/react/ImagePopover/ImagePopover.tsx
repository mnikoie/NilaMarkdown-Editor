"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type { EditorView } from "prosemirror-view";
import { insertImage } from "../../core/commands/format.js";

export interface ImagePopoverProps {
  view: EditorView | null;
  open: boolean;
  onClose: () => void;
}

export function ImagePopover({ view, open, onClose }: ImagePopoverProps) {
  const [src, setSrc] = useState("");
  const [alt, setAlt] = useState("");
  const srcRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSrc("");
    setAlt("");
    const timer = setTimeout(() => srcRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!view || !src.trim()) return;
    insertImage(src, alt)(view.state, view.dispatch, view);
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
      className="tm-link-popover tm-image-popover"
      aria-label="درجِ تصویر"
      onSubmit={submit}
      onKeyDown={onKeyDown}
    >
      <label className="tm-link-field">
        <span>متن جایگزین</span>
        <input value={alt} onChange={(event) => setAlt(event.target.value)} placeholder="توضیح تصویر" />
      </label>
      <label className="tm-link-field">
        <span>نشانی تصویر</span>
        <input
          ref={srcRef}
          value={src}
          onChange={(event) => setSrc(event.target.value)}
          placeholder="https://…"
          dir="ltr"
          inputMode="url"
        />
      </label>
      <div className="tm-link-actions">
        <button type="button" onClick={() => { view?.focus(); onClose(); }}>
          لغو
        </button>
        <button type="submit" disabled={!src.trim()}>
          درج
        </button>
      </div>
    </form>
  );
}
