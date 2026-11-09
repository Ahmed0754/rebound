"use client";

// The bar across the top of every page: home, the two places worth going, and
// which account is logged in (which is also the way to its profile). The
// footer is here too, as the other half of the frame around every page.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, ReboundMark, Sun } from "@/components/icons";
import { useCurrentUser } from "@/lib/current-user";
import { KEYS, remove, write } from "@/lib/storage";

type Theme = "dark" | "light";

//Flips data-theme on <html>, which globals.css reads, and remembers the choice.
//Dark is the default, so choosing it again just forgets the setting.
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  //The script in layout.tsx has already applied the saved theme; this only
  //catches up with it so the icon is right.
  useEffect(() => {
    if (document.documentElement.dataset.theme === "light") setTheme("light");
  }, []);

  function flip() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    if (next === "light") write("local", KEYS.theme, "light");
    else remove("local", KEYS.theme);
    setTheme(next);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={flip}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export function SiteHeader() {
  const { state } = useCurrentUser();
  const pathname = usePathname();

  //"My plans" stays lit on a single plan's page too.
  const current = (href: string) => (pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <ReboundMark />
          </span>
          <span className="brand-text">Rebound</span>
        </Link>

        <nav className="site-nav">
          {state.status === "ready" && (
            <>
              <Link href="/plans" aria-current={current("/plans")}>
                My plans
              </Link>
              <Link href="/onboarding" aria-current={current("/onboarding")}>
                New plan
              </Link>
            </>
          )}
        </nav>

        <div className="header-actions">
          <ThemeToggle />
          {state.status === "ready" ? (
            <Link href="/profile" className="account-chip" aria-label="Your profile">
              <span className="avatar">{state.user.username.charAt(0)}</span>
              <span className="account-name">{state.user.username}</span>
            </Link>
          ) : (
            <>
              <Link href="/account" className="nav-link hide-small">
                Log in
              </Link>
              <Link href="/account?mode=sign_up" className="btn btn-primary btn-small">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <Link href="/" className="brand" style={{ fontSize: 16 }}>
          <span className="brand-mark" style={{ width: 26, height: 26 }}>
            <ReboundMark size={15} />
          </span>
          Rebound
        </Link>
        <p>
          Rebound is a student project, not medical advice. Its safety thresholds have not been reviewed by a
          clinician. If something feels seriously wrong, see a doctor.
        </p>
      </div>
    </footer>
  );
}
