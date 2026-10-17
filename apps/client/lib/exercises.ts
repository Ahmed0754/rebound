// Presentation helpers for one exercise: its pictures and its steps.

// The catalogue is free-exercise-db, and an exercise's id is also the folder
// its two pictures live in: the start of the movement, then the end. A few
// exercises have no pictures at all, so whatever shows these has to cope with
// them failing to load.
const IMAGE_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

export function imageUrls(exerciseId: string): [string, string] {
  const folder = encodeURIComponent(exerciseId);
  return [`${IMAGE_BASE}/${folder}/0.jpg`, `${IMAGE_BASE}/${folder}/1.jpg`];
}

// The instructions as separate steps. The server sends one step per line;
// plans saved before it did have them run together, so those are split at
// sentence ends instead - close to the original steps, if not exact.
export function steps(description: string): string[] {
  const lines = description.includes("\n")
    ? description.split("\n")
    : description.split(/(?<=[.!?])\s+(?=[A-Z])/);

  return lines.map((line) => line.trim()).filter((line) => line.length > 0);
}
