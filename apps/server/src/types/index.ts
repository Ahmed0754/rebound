// Shapes used by more than one layer. A type used by only one file lives in that file.

// One exercise as it appears in a regime: the catalogue row plus the dose
// Gemini picked. The region belongs to the regime, not to each exercise.
export type RegimeItem = {
  id: string;
  name: string;
  description: string;
  sets: number;
  reps: number;
};

// One exercise as the client asks for it in an edit: which exercise, and the
// dose. Name and description are deliberately absent - a saved regime is the
// record of what the app told someone, so that text is resolved server-side
// and never accepted from a request.
export type RegimeEdit = {
  id: string;
  sets: number;
  reps: number;
};
