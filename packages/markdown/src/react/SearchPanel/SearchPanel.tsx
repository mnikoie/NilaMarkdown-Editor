"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import {
  search,
  searchNext,
  searchPrev,
  clearSearch,
  replaceActive,
  replaceAll,
  getSearchState,
  type SearchOptions,
} from "../../core/plugins/search.js";

/**
 * پنلِ جست‌وجو و جایگزینی.
 *
 * ★ دسترس‌پذیری: تعدادِ نتیجه با `aria-live="polite"` اعلام می‌شود، وگرنه
 * کاربرِ screen-reader نمی‌فهمد چیزی پیدا شده یا نه.
 */

export interface SearchPanelProps {
  view: EditorView | null;
  open: boolean;
  onClose: () => void;
  /** پنل با جایگزینی باز شود (Ctrl+H) یا فقط جست‌وجو (Ctrl+F). */
  withReplace?: boolean;
}

export function SearchPanel({ view, open, onClose, withReplace = false }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [options, setOptions] = useState<SearchOptions>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const [, forceRender] = useState(0);

  // با بازشدن، فوکوس در کادرِ جست‌وجو.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const runSearch = useCallback(
    (q: string, opts: SearchOptions) => {
      if (!view) return;
      search(q, opts)(view.state, view.dispatch);
      forceRender((n) => n + 1);
    },
    [view],
  );

  /** مکان‌نما را به تطبیقِ فعال می‌برد تا دیده شود. */
  const scrollToActive = useCallback(() => {
    if (!view) return;
    const s = getSearchState(view.state);
    const match = s.matches[s.active];
    if (!match) return;
    const tr = view.state.tr.setSelection(
      TextSelection.create(view.state.doc, match.from, match.to),
    );
    view.dispatch(tr.scrollIntoView());
  }, [view]);

  const goNext = useCallback(() => {
    if (!view) return;
    searchNext(view.state, view.dispatch);
    scrollToActive();
    forceRender((n) => n + 1);
  }, [view, scrollToActive]);

  const goPrev = useCallback(() => {
    if (!view) return;
    searchPrev(view.state, view.dispatch);
    scrollToActive();
    forceRender((n) => n + 1);
  }, [view, scrollToActive]);

  const close = useCallback(() => {
    if (view) clearSearch(view.state, view.dispatch);
    onClose();
    view?.focus();
  }, [view, onClose]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) goPrev();
        else goNext();
      }
    },
    [close, goNext, goPrev],
  );

  if (!open) return null;

  const state = view ? getSearchState(view.state) : null;
  const count = state?.matches.length ?? 0;
  const active = state?.active ?? -1;
  const fa = (n: number) => n.toLocaleString("fa-IR");

  const toggle = (key: keyof SearchOptions) => {
    const next = { ...options, [key]: !options[key] };
    setOptions(next);
    runSearch(query, next);
  };

  return (
    <div className="tm-search-panel" role="search" onKeyDown={onKeyDown}>
      <div className="tm-search-row">
        <input
          ref={inputRef}
          type="text"
          className="tm-search-input"
          placeholder="جست‌وجو…"
          value={query}
          aria-label="عبارتِ جست‌وجو"
          onChange={(e) => {
            setQuery(e.target.value);
            runSearch(e.target.value, options);
          }}
        />

        <span className="tm-search-count" aria-live="polite">
          {count === 0
            ? query
              ? "پیدا نشد"
              : ""
            : `${fa(active + 1)} از ${fa(count)}`}
        </span>

        <button type="button" className="tm-search-btn" onClick={goPrev} disabled={count === 0} aria-label="قبلی">
          ↑
        </button>
        <button type="button" className="tm-search-btn" onClick={goNext} disabled={count === 0} aria-label="بعدی">
          ↓
        </button>
        <button type="button" className="tm-search-btn" onClick={close} aria-label="بستن">
          ✕
        </button>
      </div>

      {withReplace ? (
        <div className="tm-search-row">
          <input
            type="text"
            className="tm-search-input"
            placeholder="جایگزین با…"
            value={replacement}
            aria-label="متنِ جایگزین"
            onChange={(e) => setReplacement(e.target.value)}
          />
          <button
            type="button"
            className="tm-search-btn tm-search-btn-wide"
            disabled={count === 0}
            onClick={() => {
              if (!view) return;
              replaceActive(replacement)(view.state, view.dispatch);
              forceRender((n) => n + 1);
            }}
          >
            جایگزینی
          </button>
          <button
            type="button"
            className="tm-search-btn tm-search-btn-wide"
            disabled={count === 0}
            onClick={() => {
              if (!view) return;
              replaceAll(replacement)(view.state, view.dispatch);
              forceRender((n) => n + 1);
            }}
          >
            همه ({fa(count)})
          </button>
        </div>
      ) : null}

      <div className="tm-search-options">
        <label>
          <input type="checkbox" checked={!!options.caseSensitive} onChange={() => toggle("caseSensitive")} />
          بزرگ و کوچک
        </label>
        <label>
          <input type="checkbox" checked={!!options.wholeWord} onChange={() => toggle("wholeWord")} />
          کلمهٔ کامل
        </label>
        <label>
          <input type="checkbox" checked={!!options.regex} onChange={() => toggle("regex")} />
          regex
        </label>
        <label title="«كتاب» عربی و «کتاب» فارسی، «۵۰» و «50» یکی حساب شوند">
          <input
            type="checkbox"
            checked={options.normalizePersian !== false}
            onChange={() => {
              const next = { ...options, normalizePersian: options.normalizePersian === false };
              setOptions(next);
              runSearch(query, next);
            }}
          />
          یک‌سان‌سازیِ فارسی
        </label>
      </div>
    </div>
  );
}
