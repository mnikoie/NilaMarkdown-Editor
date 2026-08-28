"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { OutlineNode } from "../../core/outline/types.js";
import { flattenOutline } from "../../core/outline/build.js";
import { useMarkdownI18n } from "../i18n.js";
import { ChevronDown, ChevronsUp, ListTree, Search, X } from "lucide-react";

/**
 * پنلِ درختِ ساختار.
 *
 * ★ این کامپوننت درخت نمی‌سازد — `buildOutline` می‌سازد. اینجا فقط رندر
 * است. همان درختی که تاشدنِ داخلِ سند از آن می‌خواند.
 *
 * دسترس‌پذیری: الگوی `tree` استاندارد ARIA. کلِ درخت **یک** توقفِ Tab
 * است و بینِ گره‌ها با کلیدهای جهت حرکت می‌شود — نه Tab بینِ تک‌تکِ
 * صد گره.
 */

export interface OutlineTreeProps {
  nodes: OutlineNode[];
  /** لنگرِ گرهی که مکان‌نما داخلش است. */
  activeId?: string | null;
  /** لنگرهای بسته — همان مجموعه‌ای که پلاگینِ تاشو دارد. */
  folded?: ReadonlySet<string>;
  onNavigate?: (node: OutlineNode) => void;
  onToggleFold?: (node: OutlineNode) => void;
  onCollapseAll?: () => void;
  onClose?: () => void;
  className?: string;
}

export function OutlineTree({
  nodes,
  activeId = null,
  folded,
  onNavigate,
  onToggleFold,
  onCollapseAll,
  onClose,
  className,
}: OutlineTreeProps) {
  const { locale, number, t } = useMarkdownI18n();
  const flat = useMemo(() => flattenOutline(nodes), [nodes]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedQuery = query.trim().toLocaleLowerCase(locale === "fa" ? "fa" : "en");
  const displayNodes = useMemo(
    () => (normalizedQuery ? filterOutline(nodes, normalizedQuery, locale) : nodes),
    [nodes, normalizedQuery, locale],
  );
  const displayFlat = useMemo(() => flattenOutline(displayNodes), [displayNodes]);
  const matchCount = useMemo(
    () =>
      normalizedQuery
        ? flat.filter((node) => normalize(node.title, locale).includes(normalizedQuery)).length
        : flat.length,
    [flat, normalizedQuery, locale],
  );

  /** گره‌هایی که واقعاً دیده می‌شوند — فرزندِ گرهِ بسته دیده نمی‌شود. */
  const visible = useMemo(() => {
    if (normalizedQuery || !folded || folded.size === 0) return displayFlat;
    const out: OutlineNode[] = [];
    const walk = (list: OutlineNode[]) => {
      for (const n of list) {
        out.push(n);
        if (!folded.has(n.id)) walk(n.children);
      }
    };
    walk(displayNodes);
    return out;
  }, [displayNodes, displayFlat, folded, normalizedQuery]);

  const current = focusId ?? activeId ?? visible[0]?.id ?? null;

  useEffect(() => {
    if (!activeId || normalizedQuery) return;
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-outline-id="${CSS.escape(activeId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeId, normalizedQuery]);

  const move = useCallback(
    (delta: number) => {
      const idx = visible.findIndex((n) => n.id === current);
      const next = visible[Math.max(0, Math.min(visible.length - 1, idx + delta))];
      if (next) {
        setFocusId(next.id);
        containerRef.current
          ?.querySelector<HTMLElement>(`[data-outline-id="${CSS.escape(next.id)}"]`)
          ?.focus();
      }
    },
    [visible, current],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const node = visible.find((n) => n.id === current);
      if (!node) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          move(1);
          break;
        case "ArrowUp":
          e.preventDefault();
          move(-1);
          break;
        case "Home":
          e.preventDefault();
          move(-visible.length);
          break;
        case "End":
          e.preventDefault();
          move(visible.length);
          break;
        // در RTL جهتِ «بازکردن» برعکس است، ولی معنیِ ArrowLeft/Right را
        // خودِ مرورگر برنمی‌گرداند — پس اینجا حساب می‌کنیم.
        case "ArrowRight":
        case "ArrowLeft": {
          e.preventDefault();
          const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
          const opening = rtl ? e.key === "ArrowLeft" : e.key === "ArrowRight";
          if (!node.foldable) break;
          const isFolded = folded?.has(node.id) ?? false;
          if (opening === isFolded) onToggleFold?.(node);
          break;
        }
        case "Enter":
        case " ":
          e.preventDefault();
          onNavigate?.(node);
          break;
      }
    },
    [visible, current, folded, move, onNavigate, onToggleFold],
  );

  if (nodes.length === 0) {
    return (
      <div className={`tm-outline ${className ?? ""}`}>
        <OutlineHeader
          query={query}
          count={0}
          onQueryChange={setQuery}
          onCollapseAll={onCollapseAll}
          onClose={onClose}
        />
        <p className="tm-outline-empty">{t("هنوز سرفصلی نیست.")}</p>
      </div>
    );
  }

  return (
    <div
      className={`tm-outline ${className ?? ""}`}
    >
      <OutlineHeader
        query={query}
        count={matchCount}
        onQueryChange={setQuery}
        onCollapseAll={onCollapseAll}
        onClose={onClose}
      />
      <div
        ref={containerRef}
        role="tree"
        aria-label={t("ساختارِ سند")}
        className="tm-outline-scroll"
        onKeyDown={onKeyDown}
      >
        {displayNodes.length ? (
          <Branch
            nodes={displayNodes}
            depth={1}
            activeId={activeId}
            currentId={current}
            folded={normalizedQuery ? undefined : folded}
            query={normalizedQuery}
            locale={locale}
            onNavigate={onNavigate}
            onToggleFold={onToggleFold}
          />
        ) : (
          <p className="tm-outline-empty">{t("نتیجه‌ای پیدا نشد.")}</p>
        )}
      </div>
      <div className="tm-outline-count" aria-live="polite">
        {normalizedQuery ? `${number(matchCount)} ${t("نتیجه")}` : `${number(flat.length)} ${t("عنوان")}`}
      </div>
    </div>
  );
}

interface OutlineHeaderProps {
  query: string;
  count: number;
  onQueryChange: (value: string) => void;
  onCollapseAll?: () => void;
  onClose?: () => void;
}

function OutlineHeader({ query, count, onQueryChange, onCollapseAll, onClose }: OutlineHeaderProps) {
  const { number, t } = useMarkdownI18n();
  return (
    <header className="tm-outline-header">
      <div className="tm-outline-heading">
        <span className="tm-outline-heading-icon" aria-hidden="true"><ListTree size={17} /></span>
        <strong>{t("ساختار سند")}</strong>
        <span className="tm-outline-total">{number(count)}</span>
        <span className="tm-outline-heading-actions">
          {onCollapseAll ? (
            <button type="button" className="tm-outline-action" aria-label={t("بستن همهٔ شاخه‌ها")} title={t("بستن همهٔ شاخه‌ها")} onClick={onCollapseAll}>
              <ChevronsUp size={16} aria-hidden />
            </button>
          ) : null}
          {onClose ? (
            <button type="button" className="tm-outline-action" aria-label={t("بستن پنل ساختار")} title={t("بستن پنل ساختار")} onClick={onClose}>
              <X size={17} aria-hidden />
            </button>
          ) : null}
        </span>
      </div>
      <label className="tm-outline-search">
        <Search size={15} aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          placeholder={t("جست‌وجو در ساختار…")}
          aria-label={t("جست‌وجو در ساختار")}
        />
      </label>
    </header>
  );
}

function normalize(value: string, locale: "fa" | "en") {
  return value.trim().toLocaleLowerCase(locale === "fa" ? "fa" : "en");
}

function filterOutline(nodes: OutlineNode[], query: string, locale: "fa" | "en"): OutlineNode[] {
  const out: OutlineNode[] = [];
  for (const node of nodes) {
    const children = filterOutline(node.children, query, locale);
    if (normalize(node.title, locale).includes(query) || children.length) {
      out.push({ ...node, children });
    }
  }
  return out;
}

interface BranchProps {
  nodes: OutlineNode[];
  depth: number;
  activeId: string | null;
  currentId: string | null;
  folded?: ReadonlySet<string>;
  query?: string;
  locale: "fa" | "en";
  onNavigate?: (node: OutlineNode) => void;
  onToggleFold?: (node: OutlineNode) => void;
}

function Branch({ nodes, depth, activeId, currentId, folded, query = "", locale, onNavigate, onToggleFold }: BranchProps) {
  return (
    <ul role="group" className="tm-outline-children">
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        // ★ node.foldable شاملِ «متنِ بدنه دارد» هم می‌شود (برای فلشِ
        //   خودِ سند) — اینجا فقط فرزندِ ساختاری در پنل باید فلش بگیرد،
        //   وگرنه گره‌های بدونِ زیرمجموعه (مثلِ «فرایند وصول») هم فلشِ
        //   بی‌فایده می‌گرفتند.
        const isFoldable = hasChildren;
        const isFolded = folded?.has(node.id) ?? false;
        return (
          <li key={node.id} role="none">
            <div
              role="treeitem"
              tabIndex={node.id === currentId ? 0 : -1}
              data-outline-id={node.id}
              aria-selected={node.id === activeId}
              aria-current={node.id === activeId ? "true" : undefined}
              aria-expanded={isFoldable ? !isFolded : undefined}
              aria-level={depth}
              className="tm-outline-item"
              onClick={() => onNavigate?.(node)}
            >
              {isFoldable ? (
                <button
                  type="button"
                  className="tm-fold-toggle"
                  aria-expanded={!isFolded}
                  aria-label={
                    locale === "en"
                      ? `${isFolded ? "Expand" : "Collapse"} ${node.title}`
                      : `${isFolded ? "بازکردنِ" : "بستنِ"} ${node.title}`
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFold?.(node);
                  }}
                >
                  <ChevronDown className="tm-fold-chevron" size={14} aria-hidden />
                </button>
              ) : (
                <span className="tm-fold-spacer" aria-hidden="true" />
              )}

              <span className="tm-outline-title" title={node.title}>
                <HighlightedTitle title={node.title} query={query} locale={locale} />
              </span>

              {node.status && node.status !== "نامعلوم" ? (
                <span className="tm-outline-badge">{node.status}</span>
              ) : null}
            </div>

            {hasChildren && !isFolded ? (
              <Branch
                nodes={node.children}
                depth={depth + 1}
                activeId={activeId}
                currentId={currentId}
                folded={folded}
                query={query}
                locale={locale}
                onNavigate={onNavigate}
                onToggleFold={onToggleFold}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function HighlightedTitle({ title, query, locale }: { title: string; query: string; locale: "fa" | "en" }) {
  if (!query) return title;
  const normalizedTitle = normalize(title, locale);
  const index = normalizedTitle.indexOf(query);
  if (index < 0) return title;
  return (
    <>
      {title.slice(0, index)}
      <mark>{title.slice(index, index + query.length)}</mark>
      {title.slice(index + query.length)}
    </>
  );
}
