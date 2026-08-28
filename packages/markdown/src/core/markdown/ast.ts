import { unified } from "unified";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";

/**
 * شکل مشترکِ MDAST برای Editor و Viewer.
 *
 * هر قابلیت نحوی باید فقط به این پردازنده اضافه شود؛ هر دو کامپوننت در
 * همان نسخه و با همان تنظیمات آن را دریافت می‌کنند.
 */
export interface MarkdownAstNode {
  type: string;
  value?: string;
  children?: MarkdownAstNode[];
  [key: string]: unknown;
}

const markdownAstProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkDirective);

export function parseMarkdownAst(markdown: string): MarkdownAstNode {
  return markdownAstProcessor.parse(markdown) as unknown as MarkdownAstNode;
}
