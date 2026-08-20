import { defineConfig } from "tsup";

// دو ورودیِ جدا — نه یک باندل با شاخه. کسی که فقط `viewer` را import می‌کند
// نباید کدِ ProseMirror را دانلود کند، و این فقط با entry point جدا ممکن است.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    viewer: "src/viewer.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: true,
  target: "es2022",
  external: ["react", "react-dom", "react/jsx-runtime", "katex", "mermaid", "shiki"],
});
