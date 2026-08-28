"use client";

import { useState } from "react";
import { MarkdownEditor, type MarkRegistry, BUILTIN_MARKS } from "@tamin/markdown";
import "@tamin/markdown/styles.css";
import "katex/dist/katex.min.css";

const MARKS: MarkRegistry = {
  ...BUILTIN_MARKS,
  تعریف: {
    name: "تعریف",
    label: "تعریفِ اصطلاح",
    kind: "بلوکی",
    color: "#059669",
    icon: "📘",
    variant: "کادر",
    collapsible: true,
    defaultOpen: true,
    counter: true,
    inputRule: true,
    attrs: [{ name: "واژه", label: "واژه", type: "متن" }],
  },
};

export function MarkdownDemoClient({ markdown: initialMarkdown }: { markdown: string }) {
  const [markdown, setMarkdown] = useState(initialMarkdown);

  return (
    <main className="markdown-workspace" dir="rtl">
      <MarkdownEditor
        defaultValue={initialMarkdown}
        onChange={setMarkdown}
        directives={MARKS}
        folding={false}
        outline
        outlineWidth={300}
        toolbar="compact"
        stats
        theme="auto"
        dir="auto"
        locale="fa"
        className="tm-demo-editor"
        placeholder="بنویسید…"
      />
      <output data-testid="markdown-output" hidden>
        {markdown}
      </output>
    </main>
  );
}
