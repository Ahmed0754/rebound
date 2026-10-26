// The made-up people the eval makes plans for. Each becomes a fixture in
// eval/fixtures/ once `pnpm eval:freeze` has drawn its candidates.
//
// Chosen so that every rule in clinical.ts fires at least once and every live
// criterion in quality.ts applies at least once (profiles.test.ts checks
// both), with every region covered - including the four that have no live
// criteria, where the report can only say the plan was safe. On top of that:
// the tightest combinations of rules, answers that pull against each other,
// and people who own nothing.
//
// None has a red flag. Those are refused before a plan is generated, so there
// is nothing here to grade; the classifier eval (piece F) covers screening.

import type { Answers } from "../src/clinical.js";

export type Profile = {
  id: string;
  // What this profile is here to test, in a line.
  about: string;
  answers: Answers;
  freeText: string | null;
};

// Nobody in particular: no rule fires on these alone.
const BASE: Answers = {
  goal: "return_to_movement",
  region: "knee",
  onset: "subacute",
  painNow: 2,
  aggravators: [],
  redFlags: [],
  ageBand: "30_49",
  conditions: [],
  equipment: ["none"],
  activityLevel: "recreational",
  sessionMinutes: 20,
};

function profile(id: string, about: string, answers: Partial<Answers>, freeText: string | null = null): Profile {
  return { id, about, answers: { ...BASE, ...answers }, freeText };
}

export const PROFILES: Profile[] = [
  // Knee
  profile("knee-plain", "Knee with no rule firing: the widest limits a questionnaire gives.", {}),
  profile("knee-stairs-chronic", "Chronic knee pain made worse by stairs, with bands, 10 minutes.", {
    onset: "chronic",
    painNow: 5,
    aggravators: ["stairs"],
    equipment: ["bands"],
    sessionMinutes: 10,
  }),
  profile(
    "knee-tightest",
    "Every capping rule at once: severe, fresh, 50+, a condition, sedentary, 5 minutes, nothing to use.",
    {
      onset: "acute",
      painNow: 9,
      ageBand: "50_plus",
      conditions: ["osteoporosis"],
      activityLevel: "sedentary",
      sessionMinutes: 5,
    }
  ),
  profile(
    "knee-competitive-older",
    "Pulls both ways: competitive and wanting sport back, but 50+ with diabetes.",
    {
      goal: "prevent_recurrence",
      onset: "chronic",
      painNow: 1,
      ageBand: "50_plus",
      conditions: ["diabetes"],
      activityLevel: "competitive",
      equipment: ["full_gym"],
    }
  ),

  // Hip
  profile("hip-dumbbells", "Hip, training regularly, with dumbbells.", {
    region: "hip",
    painNow: 3,
    activityLevel: "trains_regularly",
    equipment: ["dumbbells"],
  }),
  profile(
    "hip-desk",
    "Sedentary, chronic hip pain from sitting, owns nothing, 10 minutes.",
    {
      region: "hip",
      onset: "chronic",
      painNow: 4,
      ageBand: "under_30",
      aggravators: ["sitting"],
      activityLevel: "sedentary",
      sessionMinutes: 10,
    },
    "I sit at a desk all day and my hip aches by the evening."
  ),
  profile("hip-acute", "A fresh hip flare-up: stretching only, so HIP-1 does not apply.", {
    region: "hip",
    onset: "acute",
    painNow: 5,
    equipment: ["bands"],
  }),

  // Hamstring
  profile("hamstring-runner", "A competitive runner whose hamstring hates impact, with a full gym.", {
    region: "hamstring",
    goal: "prevent_recurrence",
    ageBand: "under_30",
    aggravators: ["impact"],
    activityLevel: "competitive",
    equipment: ["full_gym"],
  }),
  profile("hamstring-severe", "Chronic hamstring pain at 7: stretching only, 10 minutes.", {
    region: "hamstring",
    goal: "reduce_pain",
    onset: "chronic",
    painNow: 7,
    sessionMinutes: 10,
  }),

  // Calf
  profile("calf-plain", "Calf, owns nothing - REFERENCES.md found no bodyweight calf raise.", {
    region: "calf",
  }),
  profile("calf-older-diabetes", "Calf, 50+, diabetes, sedentary, bands, 10 minutes.", {
    region: "calf",
    onset: "chronic",
    painNow: 4,
    ageBand: "50_plus",
    conditions: ["diabetes"],
    activityLevel: "sedentary",
    equipment: ["bands"],
    sessionMinutes: 10,
  }),

  // Lower back
  profile("back-chronic", "Chronic low back pain, owns nothing: LBACK-1 and LBACK-4 both apply.", {
    region: "lower back",
    goal: "reduce_pain",
    onset: "chronic",
    painNow: 4,
  }),
  profile("back-acute-flexion", "A fresh low back flare-up that bending under load sets off.", {
    region: "lower back",
    goal: "reduce_pain",
    onset: "acute",
    painNow: 6,
    aggravators: ["loaded_flexion"],
    sessionMinutes: 10,
  }),
  profile(
    "back-lifter",
    "Trains in a full gym, low pain, but loaded bending and sitting both aggravate it.",
    {
      region: "lower back",
      goal: "prevent_recurrence",
      onset: "chronic",
      ageBand: "under_30",
      aggravators: ["loaded_flexion", "sitting"],
      activityLevel: "trains_regularly",
      equipment: ["full_gym"],
    },
    "Deadlifts used to set it off, so I stopped them."
  ),
  profile("back-osteoporosis", "Chronic low back pain, 50+, osteoporosis, sedentary, 5 minutes.", {
    region: "lower back",
    onset: "chronic",
    painNow: 5,
    ageBand: "50_plus",
    conditions: ["osteoporosis"],
    activityLevel: "sedentary",
    sessionMinutes: 5,
  }),

  // Shoulder
  profile("shoulder-overhead", "Overhead work hurts; trains regularly, with bands: all three SHLDR criteria.", {
    region: "shoulder",
    painNow: 3,
    aggravators: ["overhead"],
    activityLevel: "trains_regularly",
    equipment: ["bands"],
  }),
  profile("shoulder-gym", "Chronic, low pain, competitive, full gym: the widest shoulder pool.", {
    region: "shoulder",
    goal: "prevent_recurrence",
    onset: "chronic",
    ageBand: "under_30",
    activityLevel: "competitive",
    equipment: ["full_gym"],
  }),
  profile("shoulder-severe-older", "A fresh, severe shoulder flare-up at 50+ with an autoimmune condition.", {
    region: "shoulder",
    goal: "reduce_pain",
    onset: "acute",
    painNow: 9,
    ageBand: "50_plus",
    conditions: ["autoimmune"],
    sessionMinutes: 10,
  }),

  // The four regions with no live criteria
  profile("ankle-impact", "Ankle, impact aggravates it, owns nothing. No live criteria apply.", {
    region: "ankle",
    ageBand: "under_30",
    painNow: 3,
    aggravators: ["impact"],
  }),
  profile("ankle-acute-short", "A fresh ankle flare-up at 7, sedentary, 5 minutes.", {
    region: "ankle",
    onset: "acute",
    painNow: 7,
    activityLevel: "sedentary",
    sessionMinutes: 5,
  }),
  profile(
    "neck-desk",
    "Chronic neck pain from sitting, sedentary, 10 minutes.",
    {
      region: "neck",
      onset: "chronic",
      painNow: 4,
      aggravators: ["sitting"],
      activityLevel: "sedentary",
      sessionMinutes: 10,
    },
    "Desk job. It's worse by Friday."
  ),
  profile("neck-older", "Neck, 50+, low pain, bands.", {
    region: "neck",
    ageBand: "50_plus",
    equipment: ["bands"],
  }),
  profile("elbow-dumbbells", "Chronic elbow pain, trains regularly, with dumbbells.", {
    region: "elbow",
    onset: "chronic",
    painNow: 3,
    activityLevel: "trains_regularly",
    equipment: ["dumbbells"],
  }),
  profile("wrist-nothing", "Wrist, owns nothing, sedentary, 5 minutes: the smallest pool there is.", {
    region: "wrist",
    ageBand: "under_30",
    painNow: 5,
    activityLevel: "sedentary",
    sessionMinutes: 5,
  }),
];
