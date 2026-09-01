/**
 * Creates the exercises table (if absent) and reseeds the mock catalogue.
 * Re-runnable: the seed replaces all rows rather than appending, so running
 * it twice leaves the same 30 rows rather than 60.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

const exercises: [string, string, string][] = [
  ["knee", "Straight Leg Raise", "Lying on your back, tighten the thigh and lift the leg straight up to hip height."],
  ["knee", "Wall Sit", "Back against a wall, slide down to a seated position and hold."],
  ["knee", "Step-Up", "Step onto a low box or stair, leading with the affected leg, and step back down with control."],
  ["shoulder", "Pendulum Swing", "Lean forward, let the arm hang, and gently swing it in small circles."],
  ["shoulder", "External Rotation with Band", "Elbow at your side bent 90 degrees, rotate the forearm outward against band resistance."],
  ["shoulder", "Scapular Squeeze", "Sit or stand tall and squeeze the shoulder blades together, hold, release."],
  ["lower_back", "Cat-Cow Stretch", "On hands and knees, alternate arching and rounding the spine."],
  ["lower_back", "Bird Dog", "On hands and knees, extend opposite arm and leg while keeping the spine neutral."],
  ["lower_back", "Pelvic Tilt", "Lying on your back with knees bent, flatten the low back into the floor by tilting the pelvis."],
  ["hamstring", "Standing Hamstring Stretch", "Prop the heel on a low surface, keep the leg straight, and hinge gently at the hips."],
  ["hamstring", "Supine Hamstring Curl", "Lying face down, bend the knee to bring the heel toward the glutes."],
  ["hamstring", "Nordic Curl (Assisted)", "Kneeling with ankles anchored, lower the torso forward slowly under control."],
  ["ankle", "Ankle Alphabet", "Trace the letters of the alphabet in the air with your toes."],
  ["ankle", "Calf Raise", "Rise up onto the toes of both feet, then lower slowly."],
  ["ankle", "Resistance Band Dorsiflexion", "Band anchored in front of the foot, pull the toes up toward the shin against resistance."],
  ["hip", "Clamshell", "Lying on your side with knees bent, lift the top knee while keeping feet together."],
  ["hip", "Hip Bridge", "Lying on your back with knees bent, lift the hips toward the ceiling."],
  ["hip", "Standing Hip Abduction", "Holding support, lift the leg out to the side and lower with control."],
  ["neck", "Chin Tuck", "Gently draw the chin straight back, creating a slight double chin, and hold."],
  ["neck", "Neck Rotation Stretch", "Slowly turn the head to look over one shoulder, then the other."],
  ["neck", "Isometric Neck Press", "Press the head gently into your hand without letting the head move, hold."],
  ["wrist", "Wrist Flexor Stretch", "Arm extended, palm up, gently pull the fingers back with the other hand."],
  ["wrist", "Wrist Extensor Stretch", "Arm extended, palm down, gently press the back of the hand downward."],
  ["wrist", "Tendon Glide", "Move the fingers through a sequence of hook, fist, and straight positions."],
  ["elbow", "Elbow Flexion Stretch", "Straighten the arm fully and hold to stretch the front of the elbow."],
  ["elbow", "Wrist Curl", "Forearm supported, curl a light weight up using the wrist."],
  ["elbow", "Reverse Wrist Curl", "Forearm supported, palm down, lift a light weight using the wrist."],
  ["calf", "Standing Calf Stretch", "Hands on a wall, back leg straight, lean forward to stretch the calf."],
  ["calf", "Seated Calf Raise", "Seated with feet flat, raise the heels off the floor and lower slowly."],
  ["calf", "Eccentric Heel Drop", "Rise onto both toes, shift weight to one foot, and lower that heel slowly below step level."],
];

async function main() {
  const schemaPath = fileURLToPath(new URL("../db/schema.sql", import.meta.url));
  const schema = await readFile(schemaPath, "utf8");

  await pool.query(schema);
  console.log("Schema applied.");

  await pool.query("delete from exercises");

  // One INSERT with an unnested array, rather than 30 round trips.
  await pool.query(
    `insert into exercises (body_region, name, description)
     select * from unnest($1::text[], $2::text[], $3::text[])`,
    [
      exercises.map((e) => e[0]),
      exercises.map((e) => e[1]),
      exercises.map((e) => e[2]),
    ]
  );

  const { rows } = await pool.query<{ count: string }>("select count(*) from exercises");
  console.log(`Seeded ${rows[0].count} exercises.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
