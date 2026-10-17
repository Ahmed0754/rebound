//this is my ROOT LAYOUT (the VIEW shell)
//it wraps every page, sets the <html>/<body>, page metadata, and the base styling.

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { CurrentUserProvider } from "@/lib/current-user";
import "./globals.css";

//Self-hosted by Next at build time, so the browser never calls Google. Exposed
//as a CSS variable that globals.css puts first in the font stack.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Rebound",
  description: "Recovery plans, built from a short questionnaire.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d0f12",
};

//This is the important function
//RootLayout: renders the shared HTML shell and drops each page into {children}.
//CurrentUserProvider sits around everything so every page can read which
//account is selected.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <CurrentUserProvider>
          <SiteHeader />
          {children}
        </CurrentUserProvider>
      </body>
    </html>
  );
}
