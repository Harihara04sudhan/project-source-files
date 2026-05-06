import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PolicyMind — the policy that writes itself",
  description:
    "An ArmorPolicy feedback loop. Every approval, denial, and rollback becomes a learning signal. Claude drafts the next policy in plain English. You tap once to ratify.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
