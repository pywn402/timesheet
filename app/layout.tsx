import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IBM Design Team 工時管理",
  description: "月度工時分配與填報系統",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body className="min-h-screen bg-[#0a0a0a] text-white">{children}</body>
    </html>
  );
}
