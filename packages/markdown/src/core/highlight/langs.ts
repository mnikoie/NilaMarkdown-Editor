/**
 * زبان‌هایی که رنگ می‌گیرند.
 *
 * ★ **چرا فهرستِ دستی و نه `bundledLanguages` خودِ Shiki:** آن نگاشت
 * هر ~۲۰۰ گرامر را به باندل می‌آورد — اندازه‌گیری شد: فایلِ worker از
 * ۹٫۷ مگابایت (۱٫۷ مگابایتِ gzip) سر درآورد. هیچ سندی دویست زبان
 * ندارد.
 *
 * ★ **هر ورودی یک `import()`ِ با رشتهٔ ثابت است.** فقط این شکل را
 * باندلر می‌تواند به **چانکِ جدا** تبدیل کند. با مسیرِ متغیر
 * (`` import(`@shikijs/langs/${lang}`) ``) یا همه‌چیز می‌آید یا هیچ‌چیز.
 *
 * پس هر زبان فایلِ خودش را دارد و فقط وقتی دانلود می‌شود که سندی
 * واقعاً از آن استفاده کند.
 *
 * ★ **زبانِ بیرونِ این فهرست خطا نیست** — کد خام می‌ماند: خوانا، قابلِ
 * ویرایش، قابلِ کپی. اضافه‌کردنِ یک زبان یعنی یک خط اینجا.
 */
export const LANGS: Record<string, () => Promise<{ default: unknown }>> = {
  bash: () => import("@shikijs/langs/bash"),
  css: () => import("@shikijs/langs/css"),
  diff: () => import("@shikijs/langs/diff"),
  html: () => import("@shikijs/langs/html"),
  ini: () => import("@shikijs/langs/ini"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  markdown: () => import("@shikijs/langs/markdown"),
  python: () => import("@shikijs/langs/python"),
  sql: () => import("@shikijs/langs/sql"),
  typescript: () => import("@shikijs/langs/typescript"),
  xml: () => import("@shikijs/langs/xml"),
  yaml: () => import("@shikijs/langs/yaml"),
};

/**
 * نامِ مستعار → نامِ اصلی.
 *
 * کاربر ` ```ts ` می‌نویسد، نه ` ```typescript `. بی این نگاشت، کدِ
 * تایپ‌اسکریپت بی‌رنگ می‌ماند — که همان چیزی است که در سندِ نمونه دیدیم.
 */
export const ALIASES: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  py: "python",

  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  htm: "html",
};

/** نامی که Shiki می‌شناسد، یا `null`. */
export function resolveLang(input: string): string | null {
  const name = input.trim().toLowerCase();
  const canonical = ALIASES[name] ?? name;
  return canonical in LANGS ? canonical : null;
}
