"use client";

// An exercise's two pictures, start and finish, side by side. Hidden
// entirely if either fails: a few catalogue exercises have none, and a
// broken-image icon is worse than no picture.

import { useState } from "react";
import { imageUrls } from "@/lib/exercises";

export function ExerciseFigure({ exerciseId, name }: { exerciseId: string; name: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  const [start, finish] = imageUrls(exerciseId);

  return (
    <div className="exercise-figure">
      {/* Plain <img>: these are remote, already small, and not worth routing
          through the image optimiser and its remote-host config. */}
      <img src={start} alt={`${name}: starting position`} loading="lazy" onError={() => setFailed(true)} />
      <img src={finish} alt={`${name}: finishing position`} loading="lazy" onError={() => setFailed(true)} />
    </div>
  );
}
