import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `@tamin/markdown` از پکیج‌های workspace است و ESMِ خام منتشر می‌کند.
  // بی این، Next آن را به‌عنوانِ پکیجِ خارجی رها می‌کند و ماژول‌های
  // ProseMirror در سمتِ سرور خطا می‌دهند.
  transpilePackages: ["@tamin/markdown"],
};

export default nextConfig;
