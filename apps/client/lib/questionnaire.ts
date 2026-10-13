// The questionnaire's options, and the plain words each one is shown as.
//
// The values are copied from apps/server/src/clinical.ts - only regions has an
// endpoint. They must match the server's strings exactly; if they drift, the
// server's 400 message names the values it expects. The labels are ours.

export const GOALS = {
  return_to_movement: "Get back to moving normally",
  reduce_pain: "Reduce pain",
  prevent_recurrence: "Stop it coming back",
  general_mobility: "Move more freely in general",
} as const;

export const ONSETS = {
  acute: "Less than a week ago",
  subacute: "1 to 6 weeks ago",
  chronic: "More than 6 weeks ago",
} as const;

export const AGE_BANDS = {
  under_30: "Under 30",
  "30_49": "30–49",
  "50_plus": "50 or over",
} as const;

export const ACTIVITY_LEVELS = {
  sedentary: "Mostly sitting, little exercise",
  recreational: "Active now and then",
  trains_regularly: "I train regularly",
  competitive: "I compete in a sport",
} as const;

export const EQUIPMENT = {
  none: "No equipment",
  bands: "Resistance bands",
  dumbbells: "Dumbbells",
  full_gym: "A full gym",
} as const;

export const SESSION_MINUTES = {
  5: "5 minutes",
  10: "10 minutes",
  20: "20 minutes",
} as const;

export const AGGRAVATORS = {
  stairs: "Climbing stairs",
  overhead: "Reaching overhead",
  sitting: "Sitting for a long time",
  impact: "Running or jumping",
  loaded_flexion: "Bending forward while lifting",
} as const;

export const CONDITIONS = {
  autoimmune: "An autoimmune condition (e.g. rheumatoid arthritis, lupus)",
  diabetes: "Diabetes",
  osteoporosis: "Osteoporosis or low bone density",
} as const;

// Asked one at a time as yes/no questions, not a checklist someone skims: any
// "yes" means no plan, so the wording matters more here than anywhere else.
export const RED_FLAGS = {
  numbness_or_weakness: "Do you have numbness, tingling or weakness, or does a limb ever give way?",
  night_pain: "Does the pain wake you at night, or stay bad even when you rest?",
  recent_trauma: "Did this start with a fall, an accident or a hard knock?",
  surgery_within_6_months: "Have you had surgery in the last 6 months?",
  pregnancy_related: "Are you pregnant, or have you given birth in the last few months?",
  chest_pain_on_exertion: "Do you get chest pain when you exert yourself?",
  fever_or_weight_loss: "Have you had a fever, or lost weight without trying?",
} as const;

export type Goal = keyof typeof GOALS;
export type Onset = keyof typeof ONSETS;
export type AgeBand = keyof typeof AGE_BANDS;
export type ActivityLevel = keyof typeof ACTIVITY_LEVELS;
export type Equipment = keyof typeof EQUIPMENT;
export type SessionMinutes = 5 | 10 | 20;
export type Aggravator = keyof typeof AGGRAVATORS;
export type Condition = keyof typeof CONDITIONS;
export type RedFlag = keyof typeof RED_FLAGS;

// What POST /api/onboarding takes, minus the note.
export type Answers = {
  region: string;
  goal: Goal;
  onset: Onset;
  painNow: number;
  redFlags: RedFlag[];
  conditions: Condition[];
  ageBand: AgeBand;
  activityLevel: ActivityLevel;
  equipment: Equipment[];
  sessionMinutes: SessionMinutes;
  aggravators: Aggravator[];
};

// The questionnaire while it is being filled in. Single choices start unset so
// nothing is answered on the user's behalf. Red flags are a yes/no per
// question, also unset, so skipping one is visible rather than a silent "no".
export type Draft = {
  region: string | null;
  goal: Goal | null;
  onset: Onset | null;
  painNow: number | null;
  redFlags: Partial<Record<RedFlag, boolean>>;
  conditions: Condition[];
  ageBand: AgeBand | null;
  activityLevel: ActivityLevel | null;
  equipment: Equipment[];
  sessionMinutes: SessionMinutes | null;
  aggravators: Aggravator[];
  freeText: string;
};

export const EMPTY_DRAFT: Draft = {
  region: null,
  goal: null,
  onset: null,
  painNow: null,
  redFlags: {},
  conditions: [],
  ageBand: null,
  activityLevel: null,
  equipment: [],
  sessionMinutes: null,
  aggravators: [],
  freeText: "",
};

export const NOTE_LIMIT = 500;

export const STEPS = ["What's going on", "Safety check", "About you", "Anything else"] as const;

// What is still missing on a step, in words, or null when it is complete.
// Only completeness - every rule about what the answers mean is the server's.
export function missingOn(step: number, draft: Draft): string | null {
  if (step === 0) {
    if (draft.region === null) return "Choose where it hurts.";
    if (draft.goal === null) return "Choose a goal.";
    if (draft.onset === null) return "Choose when it started.";
    if (draft.painNow === null) return "Rate your pain right now.";
  }

  if (step === 1) {
    const unanswered = (Object.keys(RED_FLAGS) as RedFlag[]).some((flag) => draft.redFlags[flag] === undefined);
    if (unanswered) return "Answer yes or no to every question.";
  }

  if (step === 2) {
    if (draft.ageBand === null) return "Choose your age.";
    if (draft.activityLevel === null) return "Choose how active you are.";
    if (draft.equipment.length === 0) return "Choose what equipment you have, or “No equipment”.";
    if (draft.sessionMinutes === null) return "Choose how long a session should be.";
  }

  if (step === 3) {
    if (draft.freeText.trim().length > NOTE_LIMIT) return `Keep the note to ${NOTE_LIMIT} characters.`;
  }

  return null;
}

// The draft as the API takes it, once every step is complete. Red flags become
// the list of questions answered "yes".
export function toAnswers(draft: Draft): Answers | null {
  if (STEPS.some((_, step) => missingOn(step, draft) !== null)) {
    return null;
  }

  return {
    region: draft.region!,
    goal: draft.goal!,
    onset: draft.onset!,
    painNow: draft.painNow!,
    redFlags: (Object.keys(RED_FLAGS) as RedFlag[]).filter((flag) => draft.redFlags[flag] === true),
    conditions: draft.conditions,
    ageBand: draft.ageBand!,
    activityLevel: draft.activityLevel!,
    equipment: draft.equipment,
    sessionMinutes: draft.sessionMinutes!,
    aggravators: draft.aggravators,
  };
}

// Toggles one value in a multi-select, never adding a duplicate.
export function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

// "none" can't sit alongside owning something: ticking it clears the rest,
// and ticking anything else clears it.
export function toggleEquipment(values: Equipment[], value: Equipment): Equipment[] {
  if (values.includes(value)) return values.filter((v) => v !== value);
  if (value === "none") return ["none"];
  return [...values.filter((v) => v !== "none"), value];
}

// A region as a heading: "lower back" -> "Lower back".
export function regionLabel(region: string): string {
  return region.charAt(0).toUpperCase() + region.slice(1);
}
