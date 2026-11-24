// The app's big card: an exercise photo filling the top, in greyscale under a
// dark shade, with a chip at the top and a bold title and a line of facts at
// the bottom. Used for exercises, plans and the homepage's body areas.

import Link from "next/link";
import type { ReactNode } from "react";
import { Calendar, Layers } from "@/components/icons";
import type { Regime } from "@/lib/api";

export function PhotoCard({
  photo,
  chip,
  title,
  meta,
  href,
  wide,
  children,
}: {
  photo: string | null;
  chip?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  // Makes the whole top of the card a link.
  href?: string;
  // Spans the full row of a `.card-grid`.
  wide?: boolean;
  // Shown under the photo, on the plain card surface.
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
    <div className={wide ? "photo-card wide" : "photo-card"}>
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
