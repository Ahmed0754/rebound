// The app's big card: a soft colour gradient with an exercise photo blended
// into its right side, a chip at the top, a bold title and a line of facts at
// the bottom. Used for exercises, plans and the homepage's body areas.

import Link from "next/link";
import type { ReactNode } from "react";
import { Calendar, Layers } from "@/components/icons";
import type { Regime } from "@/lib/api";

// Four gradients, cycled through so neighbouring cards differ.
export const TONES = 4;

export function PhotoCard({
  tone,
  photo,
  chip,
  title,
  meta,
  href,
  wide,
  children,
}: {
  tone: number;
  photo: string | null;
  chip?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  // Makes the whole top of the card a link.
  href?: string;
  // Spans the full row of a `.card-grid`.
  wide?: boolean;
  // Shown under the coloured part, on the plain card surface.
  children?: ReactNode;
}) {
  const top = (
    <>
      {/* Decoration: the title says what it is. */}
      {photo && <img className="photo-card-img" src={photo} alt="" loading="lazy" />}
      {chip && <span className="chip">{chip}</span>}
      <div className="photo-card-text">
        <h3 className="photo-card-title">{title}</h3>
        {meta && <div className="photo-card-meta">{meta}</div>}
      </div>
    </>
  );

  return (
    <div className={`photo-card tone-${tone % TONES}${wide ? " wide" : ""}`}>
      {href ? (
        <Link className="photo-card-top" href={href}>
          {top}
        </Link>
      ) : (
        <div className="photo-card-top">{top}</div>
      )}
      {children && <div className="photo-card-body">{children}</div>}
    </div>
  );
}

//"3 exercises · 9 Nov", with icons, for a plan's card.
export function PlanMeta({ plan }: { plan: Regime }) {
  const count = plan.regime.length;

  return (
    <>
      <span>
        <Layers size={14} /> {count} exercise{count === 1 ? "" : "s"}
      </span>
      <span>
        <Calendar size={14} /> {new Date(plan.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
      </span>
    </>
  );
}
