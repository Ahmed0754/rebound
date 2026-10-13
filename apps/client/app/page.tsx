"use client";

//this is the home route, and it is only a redirect:
//no account -> /account; an account with plans -> /plans; without -> /onboarding.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountError, ErrorMessage, Loading } from "@/components/ui";
import { listRegimes, messageOf } from "@/lib/api";
import { useRequiredUser } from "@/lib/current-user";

export default function Home() {
  //useRequiredUser already sends someone with no account to /account.
  const { user, error: accountError } = useRequiredUser();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    listRegimes(user.id)
      .then((plans) => {
        if (!cancelled) router.replace(plans.length > 0 ? "/plans" : "/onboarding");
      })
      .catch((e) => {
        if (!cancelled) setError(messageOf(e));
      });

    return () => {
      cancelled = true;
    };
  }, [user, router]);

  return (
    <main className="page">
      {accountError ? (
        <AccountError message={accountError} />
      ) : error ? (
        <ErrorMessage>{error}</ErrorMessage>
      ) : (
        <Loading />
      )}
    </main>
  );
}
