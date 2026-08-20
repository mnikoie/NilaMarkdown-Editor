import { describe, it, expect } from "vitest";
import { DOMSerializer } from "prosemirror-model";
import type { Node as PMNode } from "prosemirror-model";
import { schema } from "../../src/core/schema/index.js";
import { parse } from "../../src/core/markdown/parse.js";
import { serialize } from "../../src/core/markdown/serialize.js";
import {
  isSafeHref,
  isSafeImageSrc,
  safeHref,
  sanitizeHtml,
  escapeHtml,
  processHtml,
  linkAttributes,
  BLOCKED_HREF,
} from "../../src/core/security.js";

/**
 * امنیت — بندِ ۱۱.
 *
 * اسنادِ این پروژه از فایلِ Word وارد می‌شوند، پس محتوا لزوماً مالِ خودمان
 * نیست. این تست‌ها حالتِ مهاجم را می‌سنجند، نه حالتِ خوش‌بینانه.
 */

/** سند را به DOM تبدیل می‌کند — همان مسیری که ادیتور می‌رود. */
function renderToDom(doc: PMNode): HTMLElement {
  const target = document.createElement("div");
  target.append(DOMSerializer.fromSchema(schema).serializeFragment(doc.content));
  return target;
}

describe("نشانیِ امن", () => {
  it("پروتکل‌های عادی مجازند", () => {
    for (const url of [
      "https://example.com",
      "http://example.com",
      "mailto:a@b.c",
      "tel:+98",
      "/relative",
      "./x",
      "#لنگر",
      "بدونِ-پروتکل",
    ]) {
      expect(isSafeHref(url), url).toBe(true);
    }
  });

  it("★ javascript: مسدود است — با همهٔ ترفندها", () => {
    for (const url of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "  javascript:alert(1)",
      // کاراکترهای کنترلی وسطِ نام — مرورگر اینها را نادیده می‌گیرد و اجرا می‌کند
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "java\rscript:alert(1)",
      "java\0script:alert(1)",
      "javascript:alert(1)",
    ]) {
      expect(isSafeHref(url), JSON.stringify(url)).toBe(false);
    }
  });

  it("★ data: در href مسدود است", () => {
    expect(isSafeHref("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeHref("data:image/png;base64,AAA")).toBe(false);
  });

  it("vbscript: و file: هم مسدودند", () => {
    expect(isSafeHref("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeHref("file:///etc/passwd")).toBe(false);
  });

  it("نشانیِ خالی مسدود است", () => {
    expect(isSafeHref("")).toBe(false);
    expect(isSafeHref("   ")).toBe(false);
  });

  it("safeHref نشانیِ ناامن را جایگزین می‌کند، نه حذف", () => {
    expect(safeHref("javascript:alert(1)")).toBe(BLOCKED_HREF);
    expect(safeHref("https://example.com")).toBe("https://example.com");
  });
});

describe("نشانیِ تصویر", () => {
  it("data:image مجاز است", () => {
    expect(isSafeImageSrc("data:image/png;base64,AAA")).toBe(true);
    expect(isSafeImageSrc("data:image/webp;base64,AAA")).toBe(true);
  });

  it("data:text/html در src هم مسدود است", () => {
    expect(isSafeImageSrc("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("javascript: در src مسدود است", () => {
    expect(isSafeImageSrc("javascript:alert(1)")).toBe(false);
  });
});

describe("escape", () => {
  it("تگ‌ها به متن تبدیل می‌شوند", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("★ حالتِ پیش‌فرض escape است", () => {
    const out = processHtml("<script>alert(1)</script>", "escape");
    expect(out).not.toContain("<script>");
  });
});

describe("sanitize", () => {
  it("★ script حذف می‌شود", () => {
    const out = sanitizeHtml("<p>سلام</p><script>alert(1)</script>");
    expect(out).not.toContain("<script");
    expect(out).toContain("سلام");
  });

  it("★ صفتِ on* حذف می‌شود", () => {
    const out = sanitizeHtml('<p onclick="alert(1)">متن</p>');
    expect(out).not.toContain("onclick");
    expect(out).toContain("متن");
  });

  it("★ iframe و object و embed حذف می‌شوند", () => {
    for (const tag of ["iframe", "object", "embed", "form", "style"]) {
      const out = sanitizeHtml(`<${tag}>محتوا</${tag}>`);
      expect(out, tag).not.toContain(`<${tag}`);
    }
  });

  it("★ تگِ غیرمجاز حذف می‌شود ولی متنش می‌ماند", () => {
    // محتوای کاربر نباید بی‌صدا ناپدید شود.
    const out = sanitizeHtml("<marquee>متنِ مهم</marquee>");
    expect(out).not.toContain("<marquee");
    expect(out).toContain("متنِ مهم");
  });

  it("★ href ناامن داخلِ HTML مسدود می‌شود", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">کلیک</a>');
    expect(out).not.toContain("javascript:");
    expect(out).toContain(BLOCKED_HREF);
  });

  it("تگ‌های مجاز می‌مانند", () => {
    const out = sanitizeHtml('<p><strong>پررنگ</strong> و <em>کج</em></p>');
    expect(out).toContain("<strong>");
    expect(out).toContain("<em>");
  });

  it("لینکِ سالم دست‌نخورده می‌ماند", () => {
    const out = sanitizeHtml('<a href="https://example.com" title="ت">لینک</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('title="ت"');
  });

  it("تگِ تودرتوی مخرب هم پاک می‌شود", () => {
    const out = sanitizeHtml('<div><p><img src="x" onerror="alert(1)"></p></div>');
    expect(out).not.toContain("onerror");
  });
});

describe("لینکِ خارجی", () => {
  it("rel امن می‌گیرد", () => {
    const attrs = linkAttributes("https://example.com", true);
    expect(attrs.target).toBe("_blank");
    expect(attrs.rel).toBe("noopener noreferrer");
  });

  it("لینکِ داخلی target نمی‌گیرد", () => {
    const attrs = linkAttributes("#لنگر", true);
    expect(attrs.target).toBeUndefined();
  });

  it("بی درخواستِ صریح، target نمی‌گذارد", () => {
    const attrs = linkAttributes("https://example.com");
    expect(attrs.target).toBeUndefined();
  });

  it("href ناامن در همین‌جا هم مسدود می‌شود", () => {
    expect(linkAttributes("javascript:alert(1)").href).toBe(BLOCKED_HREF);
  });
});

describe("امنیت در مسیرِ رندر", () => {
  it("★ لینکِ javascript: از مارک‌داونِ عادی هم مسدود می‌شود", () => {
    // این از HTMLِ خام نمی‌آید — نحوِ استانداردِ مارک‌داون است.
    const doc = parse("[کلیک کن](javascript:alert(1))\n");
    const dom = renderToDom(doc);
    const a = dom.querySelector("a");
    expect(a?.getAttribute("href")).toBe(BLOCKED_HREF);
    expect(a?.textContent).toBe("کلیک کن");
  });

  it("لینکِ سالم دست‌نخورده می‌ماند", () => {
    const dom = renderToDom(parse("[سایت](https://example.com)\n"));
    expect(dom.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
  });

  it("★ نشانیِ ناامن در سند می‌ماند — فقط رندر نمی‌شود", () => {
    // اگر از سند حذفش کنیم، محتوای کاربر بی‌صدا عوض می‌شود.
    //
    // remark هنگامِ نوشتن `:` و `(` را escape می‌کند — همان نشانی است و
    // دوباره یکسان parse می‌شود. پس شرط، پایداری است نه هم‌سانیِ بایتی.
    const md = "[کلیک](javascript:alert(1))\n";
    const once = serialize(parse(md));
    expect(once).toContain("javascript");
    expect(serialize(parse(once))).toBe(once);
  });

  it("★ تصویرِ با src ناامن رندر نمی‌شود ولی در سند می‌ماند", () => {
    const md = "![الف](javascript:alert(1))\n";
    const dom = renderToDom(parse(md));
    expect(dom.querySelector("img")?.getAttribute("data-blocked")).toBe("true");
    const once = serialize(parse(md));
    expect(once).toContain("javascript");
    expect(serialize(parse(once))).toBe(once);
  });

  it("data:image مجاز است و رندر می‌شود", () => {
    const dom = renderToDom(parse("![الف](data:image/png;base64,AAA)\n"));
    expect(dom.querySelector("img")?.getAttribute("data-blocked")).toBeNull();
  });
});
