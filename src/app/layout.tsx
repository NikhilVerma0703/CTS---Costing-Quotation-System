import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CTS — Costing & Quotation", template: "%s · CTS" },
  description: "Drawing-based costing and quotation — Pacific Surfaces",
};

// Stamps the hidden-sidebar choice on <html> before first paint, so a page
// never opens the rail and then slides it shut (see AppShell).
const BOOT = `try{if(localStorage.getItem("cts-sidebar-hidden")==="1")document.documentElement.setAttribute("data-sidebar-hidden","1")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
