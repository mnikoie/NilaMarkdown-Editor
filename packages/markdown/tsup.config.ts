import { defineConfig } from "tsup";

// دو ورودیِ جدا — نه یک باندل با شاخه. کسی که فقط `viewer` را import می‌کند
// نباید کدِ ProseMirror را دانلود کند، و این فقط با entry point جدا ممکن است.
export default defineConfig([
  // بیلدِ اصلی — دو ورودیِ عمومی.
  {
    entry: {
      index: "src/index.ts",
      viewer: "src/viewer.ts",
    },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    // ★ فقط این بیلد `clean` می‌کند، و چون اول اجرا می‌شود، بیلدِ دومِ
    // worker را پاک نمی‌کند.
    clean: true,
    treeshake: true,
    splitting: true,
    target: "es2022",
    external: ["react", "react-dom", "react/jsx-runtime", "katex", "mermaid", "shiki"],
  },

  // ★ **بیلدِ دومِ جدا برای worker — و Shiki داخلش باندل می‌شود.**
  //
  // این تنها تصمیمِ غیربدیهیِ اینجاست و دلیلِ اندازه‌گیری‌شده دارد:
  //
  // اگر `shiki` را `external` بگذاریم، `dist/worker.js` یک
  // `import("shiki")` دارد که **باندلرِ مصرف‌کننده باید حلش کند**. ولی
  // باندلرها فایلِ worker را یک‌دست رفتار نمی‌کنند: Turbopack در بیلدِ
  // تولیدی آن را عیناً به `static/media/` کپی می‌کند، بی هیچ پردازشی.
  // نتیجه: `import("shiki")` در مرورگر resolve نمی‌شود، بدنه می‌ایستد،
  // و بلوکِ کد تا ابد `pending` می‌ماند — بی هیچ خطایی در کنسول.
  //
  // با باندل‌کردن، `dist/worker.js` **خودکفاست**: هر باندلری هر کاری
  // بکند — پردازش یا کپیِ خام — فایل کار می‌کند.
  {
    entry: { worker: "src/core/highlight/worker.ts" },
    outDir: "dist",
    format: ["esm"],
    // ورودیِ عمومی نیست؛ کسی `import`ش نمی‌کند.
    dts: false,
    sourcemap: false,
    // ★ `clean: false` اجباری است — بیلدِ اول قبلاً پاک کرده.
    clean: false,
    // ★ هیچ `external`ی — همه‌چیز داخل.
    noExternal: [/.*/],
    treeshake: true,
    // ★ **`splitting: false` — یعنی دقیقاً یک فایل، بی هیچ چانکِ کناری.**
    //
    // این هم اندازه‌گیری‌شده است، نه احتیاط. اول با `splitting: true`
    // ساخته شد تا هر گرامر چانکِ خودش باشد؛ `worker.js` شد ۵ کیلوبایتِ
    // gzip و بقیه کنارش. ولی Turbopack در بیلدِ تولیدی **فقط همان یک
    // فایل** را به `static/media/` کپی می‌کند و چانک‌های کناری را جا
    // می‌گذارد. نتیجه: worker بار می‌شود، اولین `import()` شکست
    // می‌خورد، و بلوکِ کد تا ابد `pending` می‌ماند.
    //
    // پس فایل باید **تک** باشد. هزینه‌اش حجم است و با فهرستِ دستیِ
    // زبان‌ها در `langs.ts` مهار می‌شود.
    //
    // ★ این حجم **روی بارِ اولِ صفحه اثر ندارد**: فایل فقط وقتی دانلود
    // می‌شود که سند بلوکِ کدِ رنگی داشته باشد، و آن‌هم در رشتهٔ
    // پس‌زمینه، بعد از رندرِ صفحه.
    splitting: false,
    minify: true,
    target: "es2022",
    platform: "browser",
  },
]);
