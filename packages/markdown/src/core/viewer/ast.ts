import { parseMarkdownAst } from "../markdown/ast.js";
import { makeUnique, slugify } from "../outline/slug.js";

export interface ViewerAstNode {
  type: string;
  value?: string;
  depth?: number;
  url?: string;
  title?: string | null;
  alt?: string | null;
  lang?: string | null;
  meta?: string | null;
  ordered?: boolean;
  start?: number | null;
  checked?: boolean | null;
  align?: Array<"left" | "right" | "center" | null>;
  identifier?: string;
  label?: string;
  name?: string;
  attributes?: Record<string, string>;
  children?: ViewerAstNode[];
  position?: {
    start?: { offset?: number; line?: number; column?: number };
    end?: { offset?: number; line?: number; column?: number };
  };
  [key: string]: unknown;
}

export interface ViewerHeading {
  id: string;
  level: number;
  title: string;
}

export function parseViewerMarkdown(markdown: string): ViewerAstNode {
  return parseMarkdownAst(markdown) as ViewerAstNode;
}

export function textOfViewerNode(node: ViewerAstNode): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(textOfViewerNode).join("");
}

export function extractHeadingData(markdown: string): {
  root: ViewerAstNode;
  headings: ViewerHeading[];
  headingIds: Map<ViewerAstNode, string>;
} {
  const root = parseViewerMarkdown(markdown);
  const seen = new Map<string, number>();
  const headings: ViewerHeading[] = [];
  const headingIds = new Map<ViewerAstNode, string>();

  const walk = (node: ViewerAstNode) => {
    if (node.type === "heading") {
      const title = textOfViewerNode(node).replace(/\s*\{#[-\w:.]+\}\s*$/u, "").trim();
      const explicit = /\s*\{#([-\w:.]+)\}\s*$/u.exec(textOfViewerNode(node))?.[1];
      const id = makeUnique(explicit || slugify(title, headings.length), seen);
      const level = Math.min(6, Math.max(1, Number(node.depth) || 1));
      headingIds.set(node, id);
      headings.push({ id, level, title });
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(root);

  return { root, headings, headingIds };
}

export function extractViewerHeadings(markdown: string): ViewerHeading[] {
  return extractHeadingData(markdown).headings;
}
