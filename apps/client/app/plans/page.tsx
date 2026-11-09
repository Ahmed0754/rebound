"use client";

//this is the plan list: every plan the current account has generated, newest
//first. It is the only way the app reaches a plan, because GET /api/regimes is
//scoped to the account and GET /api/regimes/:id is not (yet).

import { useEffect, useState } from "react";
import Link from "next/link";
import { AccountError, ErrorMessage, Loading } from "@/components/ui";
import { listRegimes, messageOf, type Regime } from "@/lib/api";
import { useRequiredUser } from "@/lib/current-user";
import { regionLabel } from "@/lib/questionnaire";
import { imageUrls } from "@/lib/exercises";
import { PhotoCard, PlanMeta } from "@/components/photo-card";
import { KEYS, read } from "@/lib/storage";

export default function PlansPage() {
  const { user, token, error: accountError } = useRequiredUser();
  const [plans, setPlans] = useState<Regime[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  //The latest questionnaire, so someone sent to a doctor can find that screen
  //again. There is no endpoint listing questionnaires; this browser remembers.
  const [lastOnboarding, setLastOnboarding] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !token) return;

    setLastOnboarding(read("local", KEYS.lastOnboarding(user.id)));

    let cancelled = false;

    listRegimes(token)
      .then((list) => {
        if (!cancelled) setPlans(list);
      })
      .catch((e) => {
        if (!cancelled) setError(messageOf(e));
      });

    return () => {
      cancelled = true;
    };
  }, [user, token]);

  if (accountError) {
    return (
      <main className="page">
        <AccountError message={accountError} />
      </main>
    );
  }

  return (
    <main className="page page-app">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Your plans</h1>
        <Link className="btn btn-primary" href="/onboarding">
          New plan
        </Link>
      </div>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      {!error && plans === null && <Loading />}

      {plans !== null && plans.length === 0 && (
        <section className="card">
          <p style={{ marginTop: 0 }}>You don&apos;t have any plans yet.</p>
          <Link className="btn btn-primary" href="/onboarding">
            Answer a few questions to get one
          </Link>
        </section>
      )}

      {plans !== null && plans.length > 0 && (
        <ul className="card-grid plain-list">
          {plans.map((plan, i) => (
            <li key={plan.id} className={i === 0 ? "wide" : undefined}>
              <PhotoCard
                tone={i}
                wide={i === 0}
                href={`/plans/${plan.id}`}
                photo={plan.regime[0] ? imageUrls(plan.regime[0].id)[1] : null}
                chip={i === 0 ? "Newest" : plan.updatedAt !== plan.createdAt ? "Edited" : undefined}
                title={regionLabel(plan.muscle)}
                meta={<PlanMeta plan={plan} />}
              />
            </li>
          ))}
        </ul>
      )}

      {lastOnboarding && (
        <p className="small">
          <Link href={`/onboarding/${lastOnboarding}`}>See the results of your last questionnaire</Link>
        </p>
      )}
    </main>
  );
}
