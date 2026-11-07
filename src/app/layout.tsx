import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CTS Costing Tool", template: "%s · CTS" },
  description: "Countertop costing: upload a Drawing Summary, get every costing sheet with live recalculation. Pacific Surfaces.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
