// Shapes used by more than one layer. A type used by only one file lives in that file.

// How an exercise is dosed. Decided by the catalogue - a `static` exercise is
// held, everything else is repeated - never by the model or the client.
export type Unit = "reps" | "hold";

// One exercise as it appears in a regime: the catalogue row plus the dose
// Gemini picked. The region belongs to the regime, not to each exercise.
export type RegimeItem = {
  id: string;
  name: string;
  description: string;
  unit: Unit;
  sets: number;
  // Exactly one of these is a number, the one `unit` names. The database
  // holds the same rule as a check constraint.
  reps: number | null;
  holdSeconds: number | null;
  // Gemini's one line on why this exercise, shown to the user. Null on
  // regimes saved before it was asked for, and once an edit has changed the
  // dose it explained.
  rationale: string | null;
};

// One exercise as the client asks for it in an edit: which exercise, and the
// dose. Name and description are deliberately absent - a saved regime is the
// record of what the app told someone, so that text is resolved server-side
// and never accepted from a request. So is the unit: the client sends the
// amount the exercise is dosed in, and the server checks it is that one.
export type RegimeEdit = {
  id: string;
  sets: number;
  reps: number | null;
  holdSeconds: number | null;
};
