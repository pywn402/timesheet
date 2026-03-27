import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IBM Design Team 工時管理",
  description: "月度工時分配與填報系統",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body className="min-h-screen bg-[#f4f4f4] text-[#161616]">{children}</body>
    </html>
  );
}
