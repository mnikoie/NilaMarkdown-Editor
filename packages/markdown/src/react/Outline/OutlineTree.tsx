"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { OutlineNode } from "../../core/outline/types.js";
import { flattenOutline } from "../../core/outline/build.js";
import { useMarkdownI18n } from "../i18n.js";
import { ChevronDown } from "lucide-react";

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
  className?: string;
}

export function OutlineTree({
  nodes,
  activeId = null,
  folded,
  onNavigate,
  onToggleFold,
  className,
}: OutlineTreeProps) {
  const { t } = useMarkdownI18n();
  const flat = useMemo(() => flattenOutline(nodes), [nodes]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /** گره‌هایی که واقعاً دیده می‌شوند — فرزندِ گرهِ بسته دیده نمی‌شود. */
  const visible = useMemo(() => {
    if (!folded || folded.size === 0) return flat;
    const out: OutlineNode[] = [];
    const walk = (list: OutlineNode[]) => {
      for (const n of list) {
        out.push(n);
        if (!folded.has(n.id)) walk(n.children);
      }
    };
    walk(nodes);
    return out;
  }, [nodes, flat, folded]);

  const current = focusId ?? activeId ?? visible[0]?.id ?? null;

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
        <p className="tm-outline-empty">{t("هنوز سرفصلی نیست.")}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="tree"
      aria-label={t("ساختارِ سند")}
      className={`tm-outline ${className ?? ""}`}
      onKeyDown={onKeyDown}
    >
      <Branch
        nodes={nodes}
        depth={1}
        activeId={activeId}
        currentId={current}
        folded={folded}
        onNavigate={onNavigate}
        onToggleFold={onToggleFold}
      />
    </div>
  );
}

interface BranchProps {
  nodes: OutlineNode[];
  depth: number;
  activeId: string | null;
  currentId: string | null;
  folded?: ReadonlySet<string>;
  onNavigate?: (node: OutlineNode) => void;
  onToggleFold?: (node: OutlineNode) => void;
}

function Branch({ nodes, depth, activeId, currentId, folded, onNavigate, onToggleFold }: BranchProps) {
  const { locale } = useMarkdownI18n();
  return (
    <ul role="group" className="tm-outline-children">
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const isFoldable = node.foldable;
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

              <span className="tm-outline-title">{node.title}</span>

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
