import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownViewer } from "../../src/react/MarkdownViewer.js";
import { extractViewerHeadings } from "../../src/core/viewer/ast.js";

describe("MarkdownViewer", () => {
  afterEach(cleanup);

  it("فقط‌خواندنی، مستقل و بدون ابزارهای ویرایش رندر می‌شود", () => {
    const { container } = render(
      <MarkdownViewer value={"# عنوان\n\nمتن **مهم**\n"} theme="dark" dir="rtl" />,
    );

    expect(screen.getByRole("heading", { name: "عنوان" })).toBeTruthy();
    expect(screen.getByText("مهم").tagName).toBe("STRONG");
    const article = container.querySelector("article");
    expect(article?.classList.contains("tm-root")).toBe(true);
    expect(article?.classList.contains("tm-viewer")).toBe(true);
    expect(article?.getAttribute("data-theme")).toBe("dark");
    expect(container.querySelector("[contenteditable='true']")).toBeNull();
    expect(container.querySelector("[role='toolbar']")).toBeNull();
  });

  it("GFM، جدول، چک‌لیست و directive را با همان پردازندهٔ مشترک می‌خواند", () => {
    const { container } = render(
      <MarkdownViewer value={`# سند

- [x] انجام‌شده

| نام | مقدار |
| --- | --- |
| الف | ۱ |

:::note[یادداشت]
متن یادداشت
:::
`} />,
    );

    expect((screen.getByRole("checkbox", { name: "انجام‌شده" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(container.querySelector("[data-directive='note']")).not.toBeNull();
  });

  it("لینک و تصویر ناامن را اجرا نمی‌کند و HTML خام را متن نشان می‌دهد", () => {
    const { container } = render(
      <MarkdownViewer value={`[خطر](javascript:alert(1))

![تصویر](javascript:alert(1))

<img src=x onerror=alert(1)>
`} />,
    );

    expect(screen.getByRole("link", { name: "خطر" }).getAttribute("href")).toBe("#blocked");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".tm-viewer-raw-html")?.textContent).toContain("onerror");
  });

  it("لنگرهای فارسی را یکتا می‌سازد و ساختار را گزارش می‌دهد", async () => {
    const onOutlineChange = vi.fn();
    render(<MarkdownViewer value={"# فصل\n\n## فصل\n"} onOutlineChange={onOutlineChange} />);

    expect(extractViewerHeadings("# فصل\n\n## فصل\n")).toEqual([
      { id: "فصل", level: 1, title: "فصل" },
      { id: "فصل-2", level: 2, title: "فصل" },
    ]);
    await waitFor(() => expect(onOutlineChange).toHaveBeenCalledWith([
      { id: "فصل", level: 1, title: "فصل" },
      { id: "فصل-2", level: 2, title: "فصل" },
    ]));
  });

  it("برای سند خالی پیام قابل‌سفارشی‌سازی دارد", () => {
    render(<MarkdownViewer value={"  \n"} emptyMessage="سندی نیست" />);
    expect(screen.getByText("سندی نیست")).toBeTruthy();
  });

  it("فرمول را با KaTeX رندر می‌کند و MathML دسترس‌پذیر می‌سازد", async () => {
    const { container } = render(<MarkdownViewer value={"فرمول $E = mc^2$ است."} />);
    await waitFor(() => expect(container.querySelector(".katex-mathml")).not.toBeNull());
    expect(container.querySelector(".tm-viewer-math-inline")?.getAttribute("data-rendered")).toBe("true");
  });

  it("ویژگی‌های سنگین قابل خاموش‌کردن‌اند و سورس هیچ‌وقت گم نمی‌شود", () => {
    const { container } = render(
      <MarkdownViewer
        value={"```mermaid\ngraph LR; A-->B;\n```\n\n$$\nx^2\n$$"}
        features={{ mermaid: false, highlight: false, math: false }}
      />,
    );
    expect(container.textContent).toContain("graph LR; A-->B;");
    expect(container.textContent).toContain("$$x^2$$");
    expect(container.querySelector(".tm-viewer-code")?.getAttribute("data-highlighted")).toBe("false");
  });
});
