"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
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
  findTextMatches,
  isSearchPatternValid,
  type SearchMatch,
  type SearchOptions,
} from "../../core/plugins/search.js";
import { useMarkdownI18n } from "../i18n.js";
import { sourceOffsetTop } from "../source-position.js";

export interface SearchPanelProps {
  /** در حالتِ live مقدار دارد؛ در حالتِ source تهی است. */
  view: EditorView | null;
  open: boolean;
  onClose: () => void;
  withReplace?: boolean;
  /** جست‌وجو و جایگزینیِ مستقیم در textarea حالتِ Source. */
  sourceRef?: RefObject<HTMLTextAreaElement | null>;
  sourceText?: string;
  onSourceTextChange?: (value: string) => void;
}

/**
 * نتیجهٔ فعال را واقعاً وسطِ صفحه می‌آورد.
 *
 * `Transaction.scrollIntoView()` به‌تنهایی وجودِ نوارِ sticky بالای
 * ادیتور را نمی‌بیند و در بعضی صفحه‌ها نتیجه را زیر همان نوار نگه
 * می‌داشت. اسکرولِ DOM پس از ساخته‌شدنِ decoration این ابهام را حذف می‌کند.
 */
function revealLiveMatch(view: EditorView): void {
  const state = getSearchState(view.state);
  const match = state.matches[state.active];
  if (!match) return;

  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, match.from, match.to))
      .scrollIntoView(),
  );

  requestAnimationFrame(() => {
    const active = view.dom.querySelector<HTMLElement>(".tm-search-active");
    active?.scrollIntoView({ block: "center", inline: "nearest" });
  });
}

function revealSourceMatch(source: HTMLTextAreaElement, match: SearchMatch): void {
  source.setSelectionRange(match.from, match.to);
  const lineHeight = Number.parseFloat(getComputedStyle(source).lineHeight) || 24;
  const target = sourceOffsetTop(source, match.from);
  source.scrollTop = Math.max(0, target - (source.clientHeight - lineHeight) / 2);
}

export function SearchPanel({
  view,
  open,
  onClose,
  withReplace = false,
  sourceRef,
  sourceText = "",
  onSourceTextChange,
}: SearchPanelProps) {
  const { t, number } = useMarkdownI18n();
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [options, setOptions] = useState<SearchOptions>({});
  const [sourceMatches, setSourceMatches] = useState<SearchMatch[]>([]);
  const [sourceActive, setSourceActive] = useState(-1);
  const [invalidPattern, setInvalidPattern] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, forceRender] = useState(0);

  const runSearch = useCallback(
    (nextQuery: string, nextOptions: SearchOptions, preferredActive = 0) => {
      const valid = isSearchPatternValid(nextQuery, nextOptions);
      setInvalidPattern(!valid);

      if (view) {
        search(nextQuery, nextOptions)(view.state, view.dispatch);
        forceRender((value) => value + 1);
        if (valid && nextQuery) revealLiveMatch(view);
        return;
      }

      const source = sourceRef?.current;
      const matches = valid
        ? findTextMatches(source?.value ?? sourceText, nextQuery, nextOptions)
        : [];
      const active = matches.length === 0
        ? -1
        : Math.min(Math.max(0, preferredActive), matches.length - 1);
      setSourceMatches(matches);
      setSourceActive(active);
      if (source && active >= 0) {
        requestAnimationFrame(() => revealSourceMatch(source, matches[active]!));
      }
    },
    [sourceRef, sourceText, view],
  );

  // با بازشدن، جست‌وجوی قبلی دوباره فعال و کادر انتخاب می‌شود.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    runSearch(query, options);
  }, [open, sourceRef, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // اگر هنگام بازبودنِ پنل، متنِ خام ویرایش شد، شمارش کهنه نماند.
  useEffect(() => {
    if (!open || view || !query) return;
    runSearch(query, options, sourceActive);
  }, [open, options, query, runSearch, sourceActive, sourceText, view]);

  const goNext = useCallback(() => {
    if (view) {
      searchNext(view.state, view.dispatch);
      forceRender((value) => value + 1);
      revealLiveMatch(view);
      return;
    }
    if (sourceMatches.length === 0) return;
    const active = (sourceActive + 1 + sourceMatches.length) % sourceMatches.length;
    setSourceActive(active);
    const source = sourceRef?.current;
    if (source) revealSourceMatch(source, sourceMatches[active]!);
  }, [sourceActive, sourceMatches, sourceRef, view]);

  const goPrev = useCallback(() => {
    if (view) {
      searchPrev(view.state, view.dispatch);
      forceRender((value) => value + 1);
      revealLiveMatch(view);
      return;
    }
    if (sourceMatches.length === 0) return;
    const active = (sourceActive - 1 + sourceMatches.length) % sourceMatches.length;
    setSourceActive(active);
    const source = sourceRef?.current;
    if (source) revealSourceMatch(source, sourceMatches[active]!);
  }, [sourceActive, sourceMatches, sourceRef, view]);

  const close = useCallback(() => {
    if (view) clearSearch(view.state, view.dispatch);
    setSourceMatches([]);
    setSourceActive(-1);
    setInvalidPattern(false);
    onClose();
    if (view) view.focus();
    else sourceRef?.current?.focus();
  }, [onClose, sourceRef, view]);

  const replaceCurrent = useCallback(() => {
    if (view) {
      replaceActive(replacement)(view.state, view.dispatch);
      forceRender((value) => value + 1);
      revealLiveMatch(view);
      return;
    }
    const source = sourceRef?.current;
    const match = sourceMatches[sourceActive];
    if (!source || !match) return;
    source.setRangeText(replacement, match.from, match.to, "end");
    onSourceTextChange?.(source.value);
    runSearch(query, options, sourceActive);
  }, [onSourceTextChange, options, query, replacement, runSearch, sourceActive, sourceMatches, sourceRef, view]);

  const replaceEveryMatch = useCallback(() => {
    if (view) {
      replaceAll(replacement)(view.state, view.dispatch);
      forceRender((value) => value + 1);
      revealLiveMatch(view);
      return;
    }
    const source = sourceRef?.current;
    if (!source || sourceMatches.length === 0) return;
    let next = source.value;
    for (let index = sourceMatches.length - 1; index >= 0; index--) {
      const match = sourceMatches[index]!;
      next = `${next.slice(0, match.from)}${replacement}${next.slice(match.to)}`;
    }
    source.value = next;
    onSourceTextChange?.(next);
    runSearch(query, options);
  }, [onSourceTextChange, options, query, replacement, runSearch, sourceMatches, sourceRef, view]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) goPrev();
        else goNext();
      }
    },
    [close, goNext, goPrev],
  );

  if (!open) return null;

  const liveState = view ? getSearchState(view.state) : null;
  const count = liveState?.matches.length ?? sourceMatches.length;
  const active = liveState?.active ?? sourceActive;

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
          placeholder={t("جست‌وجو…")}
          value={query}
          aria-label={t("عبارتِ جست‌وجو")}
          aria-invalid={invalidPattern || undefined}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            runSearch(value, options);
          }}
        />

        <span className="tm-search-count" aria-live="polite">
          {invalidPattern
            ? t("الگوی نامعتبر")
            : count === 0
              ? query
                ? t("پیدا نشد")
                : ""
              : `${number(active + 1)} ${t("از")} ${number(count)}`}
        </span>

        <button type="button" className="tm-search-btn" onClick={goPrev} disabled={count === 0} aria-label={t("قبلی")}>
          ↑
        </button>
        <button type="button" className="tm-search-btn" onClick={goNext} disabled={count === 0} aria-label={t("بعدی")}>
          ↓
        </button>
        <button type="button" className="tm-search-btn" onClick={close} aria-label={t("بستن")}>
          ✕
        </button>
      </div>

      {withReplace ? (
        <div className="tm-search-row">
          <input
            type="text"
            className="tm-search-input"
            placeholder={t("جایگزین با…")}
            value={replacement}
            aria-label={t("متنِ جایگزین")}
            onChange={(event) => setReplacement(event.target.value)}
          />
          <button type="button" className="tm-search-btn tm-search-btn-wide" disabled={count === 0} onClick={replaceCurrent}>
            {t("جایگزینی")}
          </button>
          <button type="button" className="tm-search-btn tm-search-btn-wide" disabled={count === 0} onClick={replaceEveryMatch}>
            {t("همه")} ({number(count)})
          </button>
        </div>
      ) : null}

      <div className="tm-search-options">
        <label>
          <input type="checkbox" checked={!!options.caseSensitive} onChange={() => toggle("caseSensitive")} />
          {t("بزرگ و کوچک")}
        </label>
        <label>
          <input type="checkbox" checked={!!options.wholeWord} onChange={() => toggle("wholeWord")} />
          {t("کلمهٔ کامل")}
        </label>
        <label>
          <input type="checkbox" checked={!!options.regex} onChange={() => toggle("regex")} />
          regex
        </label>
        <label title={t("«كتاب» عربی و «کتاب» فارسی، «۵۰» و «50» یکی حساب شوند")}>
          <input
            type="checkbox"
            checked={options.normalizePersian !== false}
            onChange={() => {
              const next = { ...options, normalizePersian: options.normalizePersian === false };
              setOptions(next);
              runSearch(query, next);
            }}
          />
          {t("یک‌سان‌سازیِ فارسی")}
        </label>
      </div>
    </div>
  );
}
