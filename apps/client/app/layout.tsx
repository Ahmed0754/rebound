//this is my ROOT LAYOUT (the VIEW shell)
//it wraps every page, sets the <html>/<body>, page metadata, and the base styling.

import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-header";import { CurrentUserProvider } from "@/lib/current-user";
import "./globals.css";

//Downloaded at build time and served by Next itself, so no request to Google
//from the browser. Exposed as --font-sans, which globals.css reads.
//Archivo is variable in width as well as weight. The width axis is what lets
//the headings run condensed (font-stretch in globals.css) while body text
//stays at normal width, all from one family.
const sans = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-sans" });

//Runs before the first paint, so a light-theme visitor never sees a flash of
//dark. Dark unless "light" was chosen; the key is KEYS.theme in lib/storage.
const THEME_SCRIPT = `try{if(localStorage.getItem("rebound.theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export const metadata: Metadata = {
  title: "Rebound",
  description: "Recovery plans, built from a short questionnaire.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

//This is the important function
//RootLayout: renders the shared HTML shell and drops each page into {children}.
//CurrentUserProvider sits around everything so every page can read which
//account is selected.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    //data-theme is changed by the script below before React hydrates, so the
    //mismatch on this one element is expected.
    <html lang="en" className={sans.variable} data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <CurrentUserProvider>
          <SiteHeader />
          {children}
          <SiteFooter />
        </CurrentUserProvider>
      </body>
    </html>
  );
}
