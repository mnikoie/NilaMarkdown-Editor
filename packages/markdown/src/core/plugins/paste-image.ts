import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { schema } from "../schema/index.js";

/**
 * خمیرکردن و رهاکردنِ تصویر.
 *
 * ★ **پیش‌فرض `data:` است، نه آپلود.** بی هیچ تنظیمی، تصویرِ خمیرشده
 * به‌صورتِ `data:image/png;base64,…` داخلِ سند می‌نشیند و **همان‌جا کار
 * می‌کند** — بی سرور، بی پیکربندی. این همان قاعدهٔ «پیش‌فرض باید کار
 * کند» است.
 *
 * ولی `data:` برای همیشه خوب نیست: یک اسکرین‌شات به‌راحتی چند صد
 * کیلوبایت است و مستقیم در فایلِ مارک‌داون می‌نشیند. پس `onUploadImage`
 * هست تا مصرف‌کننده فایل را جایی بفرستد و فقط نشانی برگردد.
 *
 * ★ **تا وقتی آپلود تمام نشده، یک تصویرِ موقت با `blob:` نشان داده
 * می‌شود.** کاربر نباید به صفحهٔ خالی نگاه کند و حدس بزند چیزی شد یا نه.
 *
 * ★ **آپلودِ شکست‌خورده سند را خراب نمی‌کند** — تصویرِ موقت برداشته
 * می‌شود و متنِ خطا جایش می‌آید، در یک قدمِ undo که کاربر می‌تواند
 * برش گرداند.
 */

export const pasteImageKey = new PluginKey<PasteImageState>("tm-paste-image");

export interface PasteImageState {
  /** تعدادِ آپلودهای در جریان — برای نشان‌دادن در UI. */
  uploading: number;
}

export interface PasteImageOptions {
  /**
   * فایل را جایی می‌فرستد و نشانی برمی‌گرداند.
   *
   * اگر ندهید، تصویر به `data:` تبدیل می‌شود که همیشه کار می‌کند ولی
   * حجمِ سند را بالا می‌برد.
   */
  onUploadImage?: (file: File) => Promise<string>;
  /**
   * سقفِ حجم بر حسبِ بایت. پیش‌فرض ۵ مگابایت.
   *
   * ★ بی سقف، خمیرکردنِ یک عکسِ ۲۰ مگابایتی به `data:` مرورگر را
   * می‌خواباند و سند را غیرقابلِ ذخیره می‌کند.
   */
  maxBytes?: number;
  /** خبر از خطا — برای نشان‌دادن به کاربر. */
  onError?: (message: string) => void;
}

const DEFAULT_MAX = 5 * 1024 * 1024;

function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

/** فایل → `data:` URI. */
function toDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("خواندنِ فایل شکست خورد"));
    reader.readAsDataURL(file);
  });
}

function faSize(bytes: number): string {
  return (bytes / (1024 * 1024)).toLocaleString("fa-IR", { maximumFractionDigits: 1 });
}

/**
 * فایل‌ها را در جای مکان‌نما (یا `pos`) درج می‌کند.
 *
 * ★ **هر تصویر یک قدمِ undo است، نه همهٔ آن‌ها با هم.** کسی که پنج عکس
 * رها کرده و فقط آخری را نمی‌خواهد، نباید چهارتای دیگر را هم از دست
 * بدهد.
 */
export async function insertImageFiles(
  view: EditorView,
  files: File[],
  options: PasteImageOptions,
  pos?: number,
): Promise<void> {
  const { onUploadImage, maxBytes = DEFAULT_MAX, onError } = options;

  for (const file of files) {
    if (file.size > maxBytes) {
      onError?.(
        `تصویر بزرگ‌تر از حدِ مجاز است (${faSize(file.size)} مگابایت، سقف ${faSize(maxBytes)}).`,
      );
      continue;
    }

    const alt = file.name.replace(/\.[^.]+$/, "") || "تصویر";

    // بی آپلودکننده: مسیرِ ساده و همگام‌تر — یک قدمِ undo، بی جای‌گیرِ
    // موقت.
    if (!onUploadImage) {
      try {
        const src = await toDataUri(file);
        insertImage(view, src, alt, pos);
      } catch {
        onError?.("خواندنِ تصویر شکست خورد.");
      }
      continue;
    }

    // با آپلودکننده: اول جای‌گیرِ موقت با `blob:` تا کاربر ببیند چیزی
    // در راه است.
    const placeholder = URL.createObjectURL(file);
    insertImage(view, placeholder, alt, pos);

    try {
      const src = await onUploadImage(file);
      replaceSrc(view, placeholder, src);
    } catch {
      // شکست → جای‌گیر برداشته می‌شود و سند تمیز می‌ماند.
      removeBySrc(view, placeholder);
      onError?.("آپلودِ تصویر شکست خورد.");
    } finally {
      URL.revokeObjectURL(placeholder);
    }
  }
}

function insertImage(view: EditorView, src: string, alt: string, pos?: number): void {
  const node = schema.nodes.image.create({ src, alt });
  const tr = view.state.tr;
  if (pos === undefined) tr.replaceSelectionWith(node);
  else tr.insert(pos, node);
  view.dispatch(tr.scrollIntoView());
}

/** گرهٔ تصویر با `src`ِ داده‌شده را پیدا می‌کند. */
function findBySrc(view: EditorView, src: string): number | null {
  let found: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type === schema.nodes.image && node.attrs.src === src) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

function replaceSrc(view: EditorView, from: string, to: string): void {
  const pos = findBySrc(view, from);
  if (pos === null) return; // کاربر پاکش کرده — کارِ درستی نیست که برش گردانیم.
  const node = view.state.doc.nodeAt(pos);
  if (!node) return;
  view.dispatch(
    view.state.tr
      .setNodeMarkup(pos, undefined, { ...node.attrs, src: to })
      // ★ جایگزینیِ نشانی قدمِ undo نمی‌سازد: از دیدِ کاربر همان تصویر
      // است، فقط نشانی‌اش عوض شده.
      .setMeta("addToHistory", false),
  );
}

function removeBySrc(view: EditorView, src: string): void {
  const pos = findBySrc(view, src);
  if (pos === null) return;
  const node = view.state.doc.nodeAt(pos);
  if (!node) return;
  view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
}

/** تصویرهای داخلِ یک `DataTransfer`. */
function imagesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  return [...data.files].filter(isImage);
}

export function pasteImagePlugin(options: PasteImageOptions = {}): Plugin<PasteImageState> {
  return new Plugin<PasteImageState>({
    key: pasteImageKey,
    state: {
      init: () => ({ uploading: 0 }),
      apply: (tr, value) => tr.getMeta(pasteImageKey) ?? value,
    },
    props: {
      handlePaste(view, event) {
        const files = imagesFrom(event.clipboardData);
        if (files.length === 0) return false;

        // ★ متنِ همراه را نگه نمی‌داریم: وقتی کلیپ‌بورد تصویر دارد،
        // متنِ کنارش معمولاً نامِ فایل است، نه چیزی که کاربر بخواهد.
        event.preventDefault();
        void insertImageFiles(view, files, options);
        return true;
      },

      handleDrop(view, event) {
        const files = imagesFrom(event.dataTransfer);
        if (files.length === 0) return false;

        event.preventDefault();
        // ★ جای رهاشدن، نه جای مکان‌نما. کاربر عکس را جایی رها کرده و
        // انتظار دارد همان‌جا بنشیند.
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        void insertImageFiles(view, files, options, at?.pos);
        return true;
      },
    },
  });
}
