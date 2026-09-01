/**
 * Reshapes `exercises` toward the AscendAPI-native columns DATA_MODEL.md
 * describes under "[v2] Exercise — single source, AscendAPI-native". All new
 * columns are nullable: this migration only prepares the schema to receive
 * real vendor data, it does not populate it. Populating it needs
 * `fetch-catalog.ts` run against a real AscendAPI key, which does not exist
 * yet — see IMPLEMENTATION_TODO.md Phase C and Track 0's unresolved AscendAPI
 * licensing item.
 *
 * `media` is a Supabase Storage path per ADR 0020 (self-hosted, not a vendor
 * URL) — text, not jsonb, since there's exactly one string to store per
 * exercise, not a variant shape.
 */

export const up = (pgm) => {
  pgm.addColumns("exercises", {
    external_id: { type: "text" }, // AscendAPI's id; unique once populated
    category: { type: "preset_exercise_category" }, // reuses MOBILITY/STRENGTH/STRETCH
    target_muscle_groups: { type: "text[]", notNull: true, default: "{}" },
    difficulty_level: { type: "text" },
    // Nullable, and null is a distinct state from bodyweight-only per
    // DATA_MODEL.md — "Null ≠ bodyweight-only — they are distinct states."
    equipment: { type: "text" },
    media: { type: "text" }, // Supabase Storage path — see ADR 0020
    movement_pattern: { type: "text" }, // AI-derived; see enrichment note below
    progression_group: { type: "text" }, // AI-derived; see enrichment note below
    contraindications: { type: "text[]", notNull: true, default: "{}" },
    source: { type: "text" },
  });

  pgm.addConstraint("exercises", "exercises_external_id_unique", {
    unique: "external_id",
  });
};

export const down = (pgm) => {
  pgm.dropConstraint("exercises", "exercises_external_id_unique", { ifExists: true });
  pgm.dropColumns("exercises", [
    "external_id",
    "category",
    "target_muscle_groups",
    "difficulty_level",
    "equipment",
    "media",
    "movement_pattern",
    "progression_group",
    "contraindications",
    "source",
  ]);
};
