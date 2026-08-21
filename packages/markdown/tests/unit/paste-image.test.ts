import { describe, it, expect, beforeEach } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "../../src/core/schema/index.js";
import { parse } from "../../src/core/markdown/parse.js";
import { serialize } from "../../src/core/markdown/serialize.js";
import { pasteImagePlugin } from "../../src/core/plugins/paste-image.js";
import type { PasteImageOptions } from "../../src/core/plugins/paste-image.js";

/**
 * خمیرکردنِ تصویر.
 *
 * ⚠️ این فایل عمداً **NodeView نمی‌سازد** — تلهٔ ثبت‌شده در
 * `node-views.test.ts`: تستِ async + jsdom + NodeViewِ نامتقارن قفل
 * می‌شود. اینجا فقط افزونه و سند سنجیده می‌شوند، که async هم هست چون
 * `FileReader` نامتقارن است.
 */

function makeView(md = "متن\n", options: PasteImageOptions = {}) {
  const mount = document.createElement("div");
  document.body.append(mount);
  return new EditorView(mount, {
    state: EditorState.create({
      doc: parse(md),
      schema,
      plugins: [pasteImagePlugin(options)],
    }),
  });
}

/** یک PNGِ ۱×۱ واقعی — نه رشتهٔ ساختگی. */
const PNG_BYTES = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

function pngFile(name = "shot.png", bytes = PNG_BYTES): File {
  return new File([bytes as unknown as BlobPart], name, { type: "image/png" });
}

/** `DataTransfer` در jsdom ناقص است؛ کمینهٔ چیزی که افزونه می‌خواند. */
function transferWith(files: File[]): DataTransfer {
  return { files, items: [], types: files.length ? ["Files"] : [] } as unknown as DataTransfer;
}

function paste(view: EditorView, files: File[]): boolean {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", { value: transferWith(files) });
  // `someProp` وقتی هیچ افزونه‌ای دست نزند `undefined` می‌دهد، نه
  // `false` — پس نرمالش می‌کنیم.
  return view.someProp("handlePaste", (f) => !!f(view, event, view.state.doc.slice(0, 0))) === true;
}

/** تا وقتی گرهٔ تصویر ظاهر شود، یا مهلت تمام شود. */
async function waitForImage(view: EditorView, timeout = 2000): Promise<boolean> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    let found = false;
    view.state.doc.descendants((n) => {
      if (n.type === schema.nodes.image) found = true;
      return !found;
    });
    if (found) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
}

function firstImageSrc(view: EditorView): string | null {
  let src: string | null = null;
  view.state.doc.descendants((n) => {
    if (src === null && n.type === schema.nodes.image) src = (n.attrs.src as string) ?? null;
    return src === null;
  });
  return src;
}

describe("خمیرکردنِ تصویر", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("★ بی هیچ تنظیمی کار می‌کند — تصویر `data:` می‌شود", async () => {
    const view = makeView();
    expect(paste(view, [pngFile()])).toBe(true);
    expect(await waitForImage(view)).toBe(true);
    expect(firstImageSrc(view)).toMatch(/^data:image\/png;base64,/);
    view.destroy();
  });

  it("★ در مارک‌داون هم درست سریالایز می‌شود", async () => {
    const view = makeView();
    paste(view, [pngFile("نمودار.png")]);
    await waitForImage(view);
    const md = serialize(view.state.doc);

    // ★ **دونقطه در نشانی escape می‌شود** (`data\:image`)، و این درست
    // است نه باگ: `:` در نحوِ directive معنی دارد، پس remark آن را
    // محتاطانه escape می‌کند. CommonMark این escape را می‌فهمد و
    // رفت‌وبرگشت سالم می‌ماند — همین‌جا تست می‌شود.
    expect(md).toContain("![نمودار](data");
    expect(md).toContain("base64,");

    let src = "";
    parse(md).descendants((n) => {
      if (!src && n.type.name === "image") src = (n.attrs.src as string) ?? "";
      return !src;
    });
    expect(src).toMatch(/^data:image\/png;base64,/);
    view.destroy();
  });

  it("★ با `onUploadImage`، نشانیِ نهایی جایگزین می‌شود", async () => {
    const view = makeView("متن\n", {
      onUploadImage: async () => "https://cdn.example.com/a.png",
    });
    paste(view, [pngFile()]);
    await waitForImage(view);

    // اول جای‌گیرِ موقت، بعد نشانیِ نهایی.
    const end = Date.now() + 2000;
    while (Date.now() < end && firstImageSrc(view)?.startsWith("blob:")) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(firstImageSrc(view)).toBe("https://cdn.example.com/a.png");
    view.destroy();
  });

  it("★ آپلودِ شکست‌خورده سند را خراب نمی‌کند", async () => {
    const errors: string[] = [];
    const view = makeView("متن\n", {
      onUploadImage: async () => {
        throw new Error("۵۰۰");
      },
      onError: (m) => errors.push(m),
    });

    paste(view, [pngFile()]);
    // جای‌گیر می‌آید و بعد برداشته می‌شود.
    await waitForImage(view);
    const end = Date.now() + 2000;
    while (Date.now() < end && firstImageSrc(view) !== null) {
      await new Promise((r) => setTimeout(r, 10));
    }

    expect(firstImageSrc(view)).toBeNull();
    expect(errors.length).toBe(1);
    // ★ و متنِ اصلی دست‌نخورده مانده.
    expect(serialize(view.state.doc).trim()).toBe("متن");
    view.destroy();
  });

  it("★ فایلِ بزرگ‌تر از سقف رد می‌شود و پیام می‌دهد", async () => {
    const errors: string[] = [];
    const view = makeView("متن\n", { maxBytes: 10, onError: (m) => errors.push(m) });

    paste(view, [pngFile("big.png", new Uint8Array(100))]);
    await new Promise((r) => setTimeout(r, 100));

    expect(firstImageSrc(view)).toBeNull();
    expect(errors[0]).toContain("بزرگ‌تر");
    view.destroy();
  });

  it("★ فایلِ غیرتصویری اصلاً رویداد را نمی‌گیرد", () => {
    const view = makeView();
    const pdf = new File(["x"], "a.pdf", { type: "application/pdf" });
    // `false` یعنی «دست نزدم» — مرورگر رفتارِ عادیِ خودش را می‌کند.
    expect(paste(view, [pdf])).toBe(false);
    view.destroy();
  });

  it("کلیپ‌بوردِ خالی هم رویداد را نمی‌گیرد", () => {
    const view = makeView();
    expect(paste(view, [])).toBe(false);
    view.destroy();
  });

  it("★ چند تصویر با هم — هر کدام یک گره", async () => {
    const view = makeView();
    paste(view, [pngFile("a.png"), pngFile("b.png")]);

    const end = Date.now() + 3000;
    let count = 0;
    while (Date.now() < end && count < 2) {
      count = 0;
      view.state.doc.descendants((n) => {
        if (n.type === schema.nodes.image) count++;
        return true;
      });
      if (count < 2) await new Promise((r) => setTimeout(r, 10));
    }
    expect(count).toBe(2);
    view.destroy();
  });

  it("★ نامِ فایل به `alt` می‌رود — بی پسوند", async () => {
    const view = makeView();
    paste(view, [pngFile("نمودارِ رشد.png")]);
    await waitForImage(view);

    let alt: string | null = null;
    view.state.doc.descendants((n) => {
      if (alt === null && n.type === schema.nodes.image) alt = (n.attrs.alt as string) ?? null;
      return alt === null;
    });
    expect(alt).toBe("نمودارِ رشد");
    view.destroy();
  });

  it("★ تصویرِ `data:` امن است و رندر می‌شود — برخلافِ `data:` در لینک", async () => {
    const view = makeView();
    paste(view, [pngFile()]);
    await waitForImage(view);
    // `isSafeImageSrc` باید `data:image/*` را قبول کند، وگرنه تصویرِ
    // خمیرشده دیده نمی‌شود.
    const html = view.dom.innerHTML;
    expect(html).toContain("data:image/png;base64,");
    view.destroy();
  });
});
