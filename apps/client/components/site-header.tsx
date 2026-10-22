"use client";

// The bar across the top of every page: home, the two places worth going, and
// which account is logged in (which is also the way to log out).

import Link from "next/link";
import { useCurrentUser } from "@/lib/current-user";

export function SiteHeader() {
  const { state } = useCurrentUser();

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand">
          Rebound
        </Link>

        <nav className="site-nav">
          {state.status === "ready" && (
            <>
              <Link href="/plans">My plans</Link>
              <Link href="/onboarding">New plan</Link>
            </>
          )}
        </nav>

        <Link href="/account" className="account-chip">
          {state.status === "ready" ? state.user.username : "Log in"}
        </Link>
      </div>
    </header>
  );
}
