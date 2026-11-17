"use client";

//this is the workout player for one plan, full screen over the rest of the
//app. Everything it does is in components/workout-player.tsx; this page only
//loads the plan.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { WorkoutPlayer } from "@/components/workout-player";
import { AccountError, ErrorMessage, Loading } from "@/components/ui";
import { ApiError, getRegimeById, messageOf, type Regime } from "@/lib/api";
import { useRequiredUser } from "@/lib/current-user";

type Load = { status: "loading" } | { status: "missing" } | { status: "error"; message: string } | { status: "loaded"; plan: Regime };

export default function WorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token, error: accountError } = useRequiredUser();
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    getRegimeById(token, id)
      .then((plan) => {
        if (!cancelled) setLoad({ status: "loaded", plan });
      })
      .catch((e) => {
        if (cancelled) return;
        setLoad(e instanceof ApiError && e.status === 404 ? { status: "missing" } : { status: "error", message: messageOf(e) });
      });

    return () => {
      cancelled = true;
    };
  }, [token, id]);

  if (accountError) {
    return (
      <main className="page">
        <AccountError message={accountError} />
      </main>
    );
  }

  if (!user || !token || load.status === "loading") {
    return (
      <main className="page">
        <Loading />
      </main>
    );
  }

  if (load.status !== "loaded" || load.plan.regime.length === 0) {
    return (
      <main className="page">
        {load.status === "error" ? (
          <ErrorMessage>{load.message}</ErrorMessage>
        ) : (
          <>
            <h1>Plan not found</h1>
            <p className="lead">It may have been deleted, or it belongs to a different account.</p>
          </>
        )}
        <Link className="btn btn-primary" href="/plans">
          Back to my plans
        </Link>
      </main>
    );
  }

  return (
    <main>
      <WorkoutPlayer token={token} plan={load.plan} />
    </main>
  );
}
