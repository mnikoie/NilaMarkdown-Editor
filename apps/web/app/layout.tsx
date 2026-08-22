import type { Metadata } from "next";
import { Geist_Mono, Vazirmatn } from "next/font/google";
import "./globals.css";

/**
 * فونتِ اصلیِ رابط. تا پیش از این `Geist` با `subsets:["latin"]` بود و
 * `html{font-sans}` آن را به کلِ صفحه تحمیل می‌کرد؛ چون گلیفِ فارسی
 * نداشت، مرورگر به Times New Roman برمی‌گشت — علتِ اصلیِ زشتیِ متنِ سند.
 */
const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "کتابخانهٔ اسنادِ تأمین اجتماعی",
  description: "بخشنامه‌ها و قوانینِ تأمین اجتماعی — جست‌وجو، ارجاع و ویرایش",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={`${vazirmatn.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
