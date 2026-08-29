import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The development badge overlaps the editor canvas and is not useful to end users.
  devIndicators: false,
  // `nila-markdown` از پکیج‌های workspace است و ESMِ خام منتشر می‌کند.
  // بی این، Next آن را به‌عنوانِ پکیجِ خارجی رها می‌کند و ماژول‌های
  // ProseMirror در سمتِ سرور خطا می‌دهند.
  transpilePackages: ["nila-markdown"],
};

export default nextConfig;
