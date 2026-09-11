//this is my ROOT LAYOUT (the VIEW shell)
//it wraps every page, sets the <html>/<body>, page metadata, and the base styling.

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Rebound",
  description: "Recovery regimes, generated from your symptoms.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

//This is the important function
//RootLayout: renders the shared HTML shell and drops each page into {children}
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          background: "#fafafa",
          color: "#111",
        }}
      >
        {children}
      </body>
    </html>
  );
}
