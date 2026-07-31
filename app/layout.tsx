import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zhol — Kosovo-style Gin Rummy",
  description: "Play Zhol online with a friend. No account needed — pick a nickname and jump in.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
