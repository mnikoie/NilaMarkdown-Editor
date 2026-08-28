import type { Metadata } from "next";
import { ViewerClient } from "./ViewerClient";

export const metadata: Metadata = {
  title: "NilaMarkdown Viewer | نمایشگر نیلا مارک‌داون",
  description: "A lightweight, safe, read-only Markdown viewer for Persian and English documents.",
};

const VIEWER_DEMO = `# راهنمای NilaMarkdown Viewer {#viewer-guide}

این نمایشگر برای خواندن سریع و امن فایل‌های **Markdown** ساخته شده است.

## امکانات اصلی

- بازکردن فایل‌های \`.md\`، \`.markdown\` و \`.txt\`
- ساختار سند و پرش دقیق میان عنوان‌ها
- حالت روشن و تاریک
- نمایش جدول، فهرست، نقل‌قول، کد و پانویس

> نمایشگر فقط‌خواندنی است و ابزارهای ویرایش و ذخیره را بارگذاری نمی‌کند.

## نمونه جدول

| قابلیت | وضعیت |
| --- | --- |
| نمایش فارسی و RTL | فعال |
| ویرایش متن | غیرفعال |
| HTML ناامن | مسدود |
`;

export default async function ViewerPage({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: string }>;
}) {
  const { fixture } = await searchParams;
  return <ViewerClient initialMarkdown={fixture === "demo" ? VIEWER_DEMO : ""} />;
}
