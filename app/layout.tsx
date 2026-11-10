import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "图序 · AI 小红书设计工作台",
  description: "从真实素材与文案，到可编辑的小红书图文。",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head><link rel="stylesheet" href="/app.css" /><link rel="stylesheet" href="/ai.css" /><link rel="stylesheet" href="/accounts.css" /><link rel="stylesheet" href="/projects.css" /><link rel="stylesheet" href="/copy.css" /></head>
      <body>{children}</body>
    </html>
  );
}
