"use client";

// Small building blocks the pages share.

import Link from "next/link";
import type { ReactNode } from "react";

// A row of toggle buttons. Single or multi select depending on what the caller
// does in `onPick`; this only shows which values are on.
export function Choices<T extends string | number>({
  options,
  selected,
  onPick,
  disabled,
}: {
  options: Record<T, string>;
  selected: T[];
  onPick: (value: T) => void;
  disabled?: boolean;
}) {
  // Object keys are always strings; map them back to numbers when every key is
  // one (session minutes), so `selected` and `onPick` see the caller's type.
  const entries = Object.entries(options) as [string, string][];
  const numeric = entries.every(([key]) => /^\d+$/.test(key));

  return (
    <div className="choices">
      {entries.map(([key, label]) => {
        const value = (numeric ? Number(key) : key) as T;

        return (
          <button
            key={key}
            type="button"
            className="choice"
            aria-pressed={selected.includes(value)}
            onClick={() => onPick(value)}
            disabled={disabled}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p className="error" role="alert">
      {children}
    </p>
  );
}

// Shown while a page waits on the current account or its first fetch.
export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="muted">{label}</p>;
}

// For a page that needs an account when the server couldn't confirm one.
export function AccountError({ message }: { message: string }) {
  return (
    <>
      <ErrorMessage>{message}</ErrorMessage>
      <Link className="btn" href="/account">
        Go to your account
      </Link>
    </>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="back" href={href}>
      ← {children}
    </Link>
  );
}
