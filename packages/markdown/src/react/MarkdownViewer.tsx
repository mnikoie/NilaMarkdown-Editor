"use client";

import { createElement, Fragment, useEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import { isSafeImageSrc, linkAttributes } from "../core/security.js";
import { BUILTIN_MARKS } from "../core/directives/builtin.js";
import type { MarkRegistry } from "../core/directives/types.js";
import {
  extractHeadingData,
  textOfViewerNode,
  type ViewerAstNode,
  type ViewerHeading,
} from "../core/viewer/ast.js";
import {
  ViewerCodeBlock,
  ViewerMath,
  type ViewerFeatures,
} from "./viewer/ViewerEnhancements.js";

export interface MarkdownViewerProps {
  value: string;
  className?: string;
  theme?: "light" | "dark" | "auto";
  dir?: "rtl" | "ltr" | "auto";
  openLinksInNewTab?: boolean;
  emptyMessage?: string;
  directives?: MarkRegistry;
  locale?: "fa" | "en";
  features?: ViewerFeatures;
  onOutlineChange?: (headings: ViewerHeading[]) => void;
}

export function MarkdownViewer({
  value,
  className,
  theme = "auto",
  dir = "auto",
  openLinksInNewTab = true,
  emptyMessage = "فایلی برای نمایش باز نشده است.",
  directives = BUILTIN_MARKS,
  locale = "fa",
  features,
  onOutlineChange,
}: MarkdownViewerProps) {
  const parsed = useMemo(() => extractHeadingData(value), [value]);

  useEffect(() => {
    onOutlineChange?.(parsed.headings);
  }, [onOutlineChange, parsed.headings]);

  if (!value.trim()) {
    return (
      <article className={`tm-root tm-viewer tm-viewer-empty ${className ?? ""}`} data-theme={theme} dir={dir}>
        <p>{emptyMessage}</p>
      </article>
    );
  }

  const definitions = collectDefinitions(parsed.root);
  const footnotes = collectFootnotes(parsed.root);
  const context: RenderContext = {
    definitions,
    footnotes,
    headingIds: parsed.headingIds,
    openLinksInNewTab,
    directives,
    locale,
    theme,
    features: {
      math: features?.math !== false,
      highlight: features?.highlight !== false,
      mermaid: features?.mermaid !== false,
    },
  };

  return (
    <article className={`tm-root tm-viewer ${className ?? ""}`} data-theme={theme} dir={dir}>
      {renderChildren(parsed.root.children, context, "root")}
      {footnotes.size ? <Footnotes definitions={footnotes} context={context} /> : null}
    </article>
  );
}

interface RenderContext {
  definitions: Map<string, ViewerAstNode>;
  footnotes: Map<string, ViewerAstNode>;
  headingIds: Map<ViewerAstNode, string>;
  openLinksInNewTab: boolean;
  directives: MarkRegistry;
  locale: "fa" | "en";
  theme: "light" | "dark" | "auto";
  features: Required<ViewerFeatures>;
}

function renderChildren(nodes: ViewerAstNode[] | undefined, context: RenderContext, key: string): ReactNode[] {
  return (nodes ?? []).map((node, index) => renderNode(node, context, `${key}-${index}`));
}

function renderNode(node: ViewerAstNode, context: RenderContext, key: string): ReactNode {
  const children = renderChildren(node.children, context, key);

  switch (node.type) {
    case "root":
      return <Fragment key={key}>{children}</Fragment>;
    case "yaml":
    case "definition":
    case "footnoteDefinition":
      return null;
    case "text":
      return <Fragment key={key}>{node.value ?? ""}</Fragment>;
    case "paragraph":
      return <p key={key}>{children}</p>;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.depth) || 1));
      const id = context.headingIds.get(node);
      const visibleChildren = stripExplicitHeadingId(children);
      return createElement(`h${level}`, { key, id, tabIndex: -1 }, visibleChildren);
    }
    case "strong":
      return <strong key={key}>{children}</strong>;
    case "emphasis":
      return <em key={key}>{children}</em>;
    case "delete":
      return <del key={key}>{children}</del>;
    case "inlineCode":
      return <code key={key}>{node.value ?? ""}</code>;
    case "code":
      return <ViewerCodeBlock key={key} code={node.value ?? ""} lang={node.lang} features={context.features} theme={context.theme} locale={context.locale} />;
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>;
    case "break":
      return <br key={key} />;
    case "thematicBreak":
      return <hr key={key} />;
    case "list": {
      const Tag = node.ordered ? "ol" : "ul";
      return <Tag key={key} start={node.ordered ? node.start ?? undefined : undefined}>{children}</Tag>;
    }
    case "listItem":
      return (
        <li key={key} className={node.checked != null ? "tm-viewer-task" : undefined}>
          {node.checked != null ? <input type="checkbox" checked={node.checked} readOnly aria-label={node.checked ? "انجام‌شده" : "انجام‌نشده"} /> : null}
          {children}
        </li>
      );
    case "link": {
      const attrs = linkAttributes(String(node.url ?? ""), context.openLinksInNewTab);
      return <a key={key} {...attrs} title={node.title ?? undefined}>{children}</a>;
    }
    case "linkReference": {
      const definition = context.definitions.get(normalizeIdentifier(node.identifier));
      if (!definition) return <Fragment key={key}>{children}</Fragment>;
      const attrs = linkAttributes(String(definition.url ?? ""), context.openLinksInNewTab);
      return <a key={key} {...attrs} title={definition.title ?? undefined}>{children}</a>;
    }
    case "image": {
      const source = String(node.url ?? "");
      return isSafeImageSrc(source)
        ? <img key={key} src={source} alt={node.alt ?? ""} title={node.title ?? undefined} loading="lazy" />
        : <span key={key} className="tm-viewer-blocked">[{node.alt || "تصویر مسدودشده"}]</span>;
    }
    case "imageReference": {
      const definition = context.definitions.get(normalizeIdentifier(node.identifier));
      const source = String(definition?.url ?? "");
      return definition && isSafeImageSrc(source)
        ? <img key={key} src={source} alt={node.alt ?? ""} title={definition.title ?? undefined} loading="lazy" />
        : <span key={key} className="tm-viewer-blocked">[{node.alt || "تصویر مسدودشده"}]</span>;
    }
    case "html":
      return <code key={key} className="tm-viewer-raw-html">{node.value ?? ""}</code>;
    case "inlineMath":
      return <ViewerMath key={key} tex={node.value ?? ""} displayMode={false} enabled={context.features.math} />;
    case "math":
      return <ViewerMath key={key} tex={node.value ?? ""} displayMode enabled={context.features.math} />;
    case "table":
      return <div className="tm-viewer-table-wrap" key={key}><table>{renderTable(node, context, key)}</table></div>;
    case "textDirective": {
      const definition = context.directives[node.name ?? ""];
      return (
        <span
          key={key}
          className="tm-viewer-directive-inline"
          data-directive={node.name}
          style={directiveStyle(definition?.color)}
        >
          {children}
        </span>
      );
    }
    case "leafDirective":
    case "containerDirective": {
      const definition = context.directives[node.name ?? ""];
      return (
        <section
          key={key}
          className="tm-viewer-directive"
          data-directive={node.name}
          data-variant={definition?.variant}
          style={directiveStyle(definition?.color)}
        >
          <header>{directiveTitle(node, context.directives)}</header>
          <div>{children}</div>
        </section>
      );
    }
    case "footnoteReference": {
      const identifier = normalizeIdentifier(node.identifier);
      const number = [...context.footnotes.keys()].indexOf(identifier) + 1;
      return <sup key={key}><a href={`#footnote-${identifier}`} id={`footnote-ref-${identifier}`}>{number > 0 ? number : "؟"}</a></sup>;
    }
    default:
      return children.length ? <Fragment key={key}>{children}</Fragment> : (node.value ?? null);
  }
}

function renderTable(node: ViewerAstNode, context: RenderContext, key: string) {
  const rows = node.children ?? [];
  return (
    <>
      {rows[0] ? <thead>{renderTableRow(rows[0], context, `${key}-head`, true, node.align)}</thead> : null}
      {rows.length > 1 ? <tbody>{rows.slice(1).map((row, index) => renderTableRow(row, context, `${key}-row-${index}`, false, node.align))}</tbody> : null}
    </>
  );
}

function renderTableRow(row: ViewerAstNode, context: RenderContext, key: string, header: boolean, align?: ViewerAstNode["align"]) {
  const Cell = header ? "th" : "td";
  return (
    <tr key={key}>
      {(row.children ?? []).map((cell, index) => (
        <Cell key={`${key}-${index}`} style={{ textAlign: align?.[index] ?? undefined } as CSSProperties}>
          {renderChildren(cell.children, context, `${key}-${index}`)}
        </Cell>
      ))}
    </tr>
  );
}

function collectDefinitions(root: ViewerAstNode) {
  const definitions = new Map<string, ViewerAstNode>();
  walk(root, (node) => {
    if (node.type === "definition") definitions.set(normalizeIdentifier(node.identifier), node);
  });
  return definitions;
}

function collectFootnotes(root: ViewerAstNode) {
  const definitions = new Map<string, ViewerAstNode>();
  walk(root, (node) => {
    if (node.type === "footnoteDefinition") definitions.set(normalizeIdentifier(node.identifier), node);
  });
  return definitions;
}

function Footnotes({ definitions, context }: { definitions: Map<string, ViewerAstNode>; context: RenderContext }) {
  return (
    <section className="tm-viewer-footnotes" aria-label="پانویس‌ها">
      <hr />
      <ol>
        {[...definitions].map(([identifier, definition], index) => (
          <li key={identifier} id={`footnote-${identifier}`}>
            {renderChildren(definition.children, context, `footnote-${index}`)}
            <a href={`#footnote-ref-${identifier}`} aria-label="بازگشت به متن">↩</a>
          </li>
        ))}
      </ol>
    </section>
  );
}

function directiveTitle(node: ViewerAstNode, directives: MarkRegistry) {
  const definition = directives[node.name ?? ""];
  const name = definition?.label || node.name || "یادداشت";
  const icon = definition?.icon;
  const number = node.attributes?.["شماره"];
  const label = node.label;
  return [icon, name, number, label].filter(Boolean).join(" — ");
}

function directiveStyle(color?: string): CSSProperties | undefined {
  if (!color) return undefined;
  return { "--tm-viewer-directive-accent": color } as CSSProperties;
}

function normalizeIdentifier(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function walk(node: ViewerAstNode, visit: (node: ViewerAstNode) => void) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function stripExplicitHeadingId(children: ReactNode[]): ReactNode[] {
  const last = children.at(-1);
  if (typeof last !== "object" || last === null || !("props" in last)) return children;
  const props = (last as { props?: { children?: unknown } }).props;
  if (typeof props?.children !== "string") return children;
  const clean = props.children.replace(/\s*\{#[-\w:.]+\}\s*$/u, "");
  if (clean === props.children) return children;
  return [...children.slice(0, -1), clean];
}
