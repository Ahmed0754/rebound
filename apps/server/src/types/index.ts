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
