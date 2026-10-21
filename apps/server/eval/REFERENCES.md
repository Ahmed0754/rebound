# Evaluation references

*The published sources the eval harness grades plans against: dose benchmarks, region guidance, safety statements and reference plans. **Draft for review, 2026-10-20.** Nothing here is clinically reviewed, and no code reads it yet. It becomes a typed module (`references.ts`) once each criterion has been reviewed.*

## How this file is used

- **For grading, not generating.** The harness scores Gemini's plans and the baselines against these entries. None of it goes into the generation prompt. A file that both guides Gemini and grades it would give circular scores. Feeding it into generation is a later, separate experiment (see [Using this in generation](#using-this-in-generation)).
- **Code checks** use the dose benchmarks and the reference plans.
- **The LLM judge** uses the region criteria and the safety statements, one score per criterion.
- **Every score names its criterion, and every criterion names its source**, so a report reads like *"missed hip-targeted work (APTA PFP 2019)"*.
- **[`clinical.ts`](../src/clinical.ts) cites these ids** beside each constant and rule that can be traced to one. Anything without an id is marked there as judgment.

## Credit rules

1. **Every entry names at least one source id** from [Sources](#1-sources). In the typed version this is a required, non-empty field, so an uncredited entry fails typecheck.
2. **Credit the publisher, and the summary too.** When a guideline was read through a summary, both are credited: the guideline for the claim, the summary for where we read it.
3. **Paraphrase rather than copy.** Numbers and facts are cited. A direct quote is kept to one sentence and marked with quotation marks.
4. **Credit is not permission.** OrthoInfo's terms allow personal and patient-education use. Grading internally against cited facts is the cautious reading of that. Sending AAOS content to Gemini in a prompt, or showing it in the app, needs permission from OrthoInfo@aaos.org first. (Not legal advice.)
5. **Every harness report ends with a Sources section** listing each publisher whose criteria it used.

## How each source was read

| Label | Meaning | What it can support |
|---|---|---|
| **Primary** | We read the publisher's own page or full text. | Criteria and benchmarks |
| **Summary** | We read a third party's summary of the source, named in the table. | Criteria marked *provisional* until someone reads the primary text |
| **Cited only** | We confirmed the source exists, but not its content. | Nothing yet. It's listed so it gets read. |

Several primary texts couldn't be fetched automatically. orthopt.org, jospt.org and nhsinform.scot all refused the request (`403`). Opening them in a browser is the first step toward promoting a *Summary* entry to *Primary*.

---

## 1. Sources

Accessed 2026-10-20 unless noted.

### AAOS OrthoInfo conditioning programs

Publisher: **American Academy of Orthopaedic Surgeons (AAOS)**, OrthoInfo. © 1995–2026 AAOS. All five programs say to continue for 4–6 weeks, warm up for 5–10 minutes, stretch before and after strengthening, and *"You should not feel pain during an exercise."*

| Id | Program | Contributors named on the page | URL | Read |
|---|---|---|---|---|
| `AAOS-KNEE` | Knee Conditioning Program | None named | https://www.orthoinfo.org/recovery/knee-conditioning-program | Primary |
| `AAOS-SHOULDER` | Rotator Cuff and Shoulder Conditioning Program | "Written and/or reviewed by a member of the American Shoulder and Elbow Surgeons (ASES)" | https://www.orthoinfo.org/recovery/rotator-cuff-and-shoulder-conditioning-program | Primary |
| `AAOS-HIP` | Hip Conditioning Program | Michael J. Alaia, MD, FAAOS | https://www.orthoinfo.org/recovery/hip-conditioning-program | Primary |
| `AAOS-SPINE` | Spine Conditioning Program | Daniel K. Park, MD, FAAOS; peer-reviewed by Thomas Ward Throckmorton, MD, FAAOS | https://www.orthoinfo.org/recovery/spine-conditioning-program | Primary |
| `AAOS-FOOTANKLE` | Foot and Ankle Conditioning Program | Jordan J. Moen, DPT; peer-reviewed by Taylor Beahrs, MD | https://www.orthoinfo.org/recovery/foot-and-ankle-conditioning-program | Primary |

### American College of Sports Medicine (ACSM)

| Id | Source | URL | Read |
|---|---|---|---|
| `ACSM-FLEX-2021` | ACSM, *Stretching and Flexibility Guidelines Update*, ACSM Certified blog, 2021-03-18. Cites Table 5.6 of ACSM's *Guidelines for Exercise Testing and Prescription*, 11th ed. | https://www.acsm.org/blog-detail/acsm-certified-blog/2021/03/18/stretching-and-flexibility-guidelines-update (returned `404` when fetched; read through search excerpts of the same page) | Summary |
| `ACSM-RT-2009` | ACSM Position Stand, *Progression Models in Resistance Training for Healthy Adults*, Med Sci Sports Exerc 2009;41(3):687–708 | https://sfu.ca/~ryand/kin343/ACSMresistance.pdf (course-hosted copy) | Summary (excerpts) |
| `ACSM-GETP-12` | *ACSM's Guidelines for Exercise Testing and Prescription*, 12th ed. | https://acsm.org/education-resources/books/guidelines-exercise-testing-prescription | Cited only (paid book) |

### APTA clinical practice guidelines, published in JOSPT

Publisher: **Journal of Orthopaedic & Sports Physical Therapy (JOSPT)**, for the American Physical Therapy Association (APTA) academies named.

**These guidelines each cover one condition**, such as patellofemoral pain or hip osteoarthritis. Rebound doesn't diagnose; it takes a body region. So applying a guideline to "knee pain" in general is **an extrapolation**, and every criterion drawn from one is labelled *condition-specific*.

| Id | Guideline | Citation | Read | Summary read |
|---|---|---|---|---|
| `APTA-PFP-2019` | Patellofemoral Pain (Academy of Orthopaedic PT) | Willy RW, et al. JOSPT 2019;49(9):CPG1–CPG95. doi:10.2519/jospt.2019.0302 | Summary | American Family Physician, *Patellofemoral Pain: Guidelines from the APTA*, 2020-10-01. https://www.aafp.org/pubs/afp/issues/2020/1001/p442.html |
| `APTA-LBP-2021` | Interventions for the Management of Acute and Chronic Low Back Pain: Revision 2021 (Academy of Orthopaedic PT) | George SZ, Fritz JM, Silfies SP, et al. JOSPT 2021;51(11):CPG1–CPG60. doi:10.2519/jospt.2021.0304 | **Primary** (author manuscript, PMC10508241) | — |
| `APTA-NECK-2017` | Neck Pain: Revision 2017 (Orthopaedic Section) | Blanpied PR, et al. JOSPT 2017;47(7):A1–A83. doi:10.2519/jospt.2017.0302 | Summary | Physical Therapy First, guideline summary. https://physicaltherapyfirst.com/?p=11458 |
| `APTA-HAMSTRING-2022` | Hamstring Strain Injury in Athletes (Academy of Orthopaedic PT and Academy of Sports PT) | Martin RL, et al. JOSPT 2022;52(3):CPG1–CPG44. doi:10.2519/jospt.2022.0301 | Summary | MEND Colorado blog (2022-02-23), and the CAATE/NATA Foundation research-to-practice newsletter (Oct 2022) |
| `APTA-ACHILLES-2024` | Midportion Achilles Tendinopathy: Revision 2024 (Academy of Orthopaedic PT) | JOSPT 2024. doi:10.2519/jospt.2024.0302 | Summary | Search-tool excerpts of the published PDF on orthopt.org, plus the Physical Therapy First summary |
| `APTA-ANKLE-2021` | Lateral Ankle Ligament Sprains: Revision 2021 (Academy of Orthopaedic PT) | Martin RL, et al. JOSPT 2021;51(4):CPG1–CPG80. doi:10.2519/jospt.2021.0302 | Summary | *OCS Field Guide* podcast, "Lateral ankle sprains CPG: interventions" |
| `APTA-HIPOA-2025` | Hip Pain and Mobility Deficits — Hip Osteoarthritis: Revision 2025 (Academy of Orthopaedic PT) | Koc TA, et al. JOSPT 2025;55(11):CPG1–CPG31 | Summary | Physiotutors, *Hip osteoarthritis: the new 2025 CPG* |
| `APTA-ELBOW-2022` | Lateral Elbow Pain and Muscle Function Impairments (Academy of Hand and Upper Extremity PT and Academy of Orthopaedic PT) | Lucado AM, et al. JOSPT 2022;52(12):CPG1–CPG111. doi:10.2519/jospt.2022.0302 | Cited only | — |
| `CPG-RC-2025` | Rotator Cuff Tendinopathy Diagnosis, Non-Surgical Medical Care and Rehabilitation (Quebec Rehabilitation Network and others, with the Academy of Orthopaedic PT) | Desmeules F, et al. JOSPT 2025. doi:10.2519/jospt.2025.13182 | Cited only | — |

### Other

| Id | Source | URL | Read |
|---|---|---|---|
| `NHS-NECK` | NHS (England), *Neck pain*. Last reviewed 2023-04-27, review due 2026-04-27, so it's past due. © Crown copyright. | https://www.nhs.uk/conditions/neck-pain/ | Primary |
| `KISNER-8` | Kisner C, Borstad J, Colby LA. *Therapeutic Exercise: Foundations and Techniques*, 8th ed. F.A. Davis, 2023 (some catalogues say Dec 2022). ISBN 9781719640473 | — | Cited only. Add entries by hand with page numbers. |

---

## 2. Dose benchmarks

Rebound's numbers come from `ABSOLUTE` and `RULES` in [`clinical.ts`](../src/clinical.ts). The harness uses this table two ways. Code checks compare a plan's doses with the benchmark, and a **"stricter than the sources"** note goes in the report rather than a failure, because Rebound being more cautious is a deliberate choice.

| Parameter | Rebound | What the sources say | Sources | Finding |
|---|---|---|---|---|
| **Static stretch hold** | 15–30 s for everyone. Rules can lower the ceiling to 20 s. | Knee quadriceps and hamstring stretches: 30–60 s. Shoulder, hip, spine and foot stretches: 30 s, repeated about 4 times with 30 s rest. Hip hamstring stretch: 30–60 s. Most adults 10–30 s; *"older individuals"* 30–60 s may confer greater benefit. | `AAOS-KNEE`, `AAOS-SHOULDER`, `AAOS-HIP`, `AAOS-FOOTANKLE`, `ACSM-FLEX-2021` | Rebound's maximum is AAOS's *minimum*. The `older_adult` rule (50+) lowers sets and reps but never lengthens holds, the opposite direction from ACSM. ACSM's excerpt doesn't define "older". **For the expert.** |
| **Stretch volume** | One hold per set; sets 1–4 | About 60 s total per muscle group, as 2–4 repetitions | ACSM 2011 position stand, as reproduced in secondary copies (not read directly) | Provisional. Rebound's 2 sets × 30 s fits it. |
| **Strength reps** | 5–15. Rules can lower it to 8, 10 or 12. | 10 for most knee exercises; 20 for hip abduction and adduction. Shoulder: 8, and 20 for trapezius and rotation work. Hip: 8 progressing to 12; clamshell 10–15. Novices: an 8–12 rep maximum. | `AAOS-KNEE`, `AAOS-SHOULDER`, `AAOS-HIP`, `ACSM-RT-2009` | Mostly consistent. AAOS's 20-rep endurance work can't be prescribed under Rebound's cap of 15. |
| **Sets** | 1–4. Rules can lower it to 2 or 3. | Mostly 2–3; shoulder rotation 3–4 | `AAOS-*` | Consistent |
| **Strength frequency** | Not set. The roadmap's twice-daily sessions would schedule strength work daily. | **Loaded** strengthening (weights, bands, machines): 3 days/week for the shoulder and for ankle band work, 4–5 for the knee, 2–3 for the hip. Novices: 2–3 sessions/week. **Bodyweight** core and calf work is daily: all spine exercises, calf raises 6–7 days, and clamshells. Stretches 4–7 days/week. | `AAOS-*`, `ACSM-RT-2009` | **Daily *loaded* strength work goes beyond AAOS and ACSM.** Daily bodyweight core and calf work matches AAOS. A question for the session design (F2) and Flow B, not for today's plans. |
| **Reps with a hold** | A plan item is dosed in reps *or* a hold (ADR 0023) | Many AAOS strength exercises are "3 sets of 10 with a 5 s hold" (straight-leg raise, half squat, hip abduction) | `AAOS-KNEE`, `AAOS-HIP` | Rebound can't express it. A gap in the data model, not in any plan. |
| **Core holds** | `force = static` exercises are dosed as holds of 15–30 s | Plank 5 × 30 s; bird dog, side plank, bridge and abdominal bracing 5 × 15 s | `AAOS-SPINE` | Consistent, where the catalogue tags the exercise `static` (see the bridge entry in [Reference plans](#5-reference-plans)) |
| **Warm-up** | None | 5–10 min of low-impact activity, then stretch, strengthen, and stretch again | `AAOS-*` | Rebound has no warm-up step. A question for the session player (F2). |
| **Program length** | Open-ended | 4–6 weeks, then maintenance 2–3 days/week (3–5 for foot and ankle) | `AAOS-*` | Relevant to Flow B's progression and to *"what happens when the goal is met"* (STATUS open question 4) |

---

## 3. Region criteria

One section per Rebound region. **Rebound's muscles** are its `region_muscles` mapping (migration `1790783482000_region-muscles.js`).

**A criterion only applies when the plan's limits allow it.** If the limits allow stretching only (pain 7+ or a recent flare-up), a strengthening criterion scores *not applicable*, not *failed*.

Criterion kinds:
- **core:** from the AAOS program for that region, which is general rather than tied to one condition.
- **condition-specific:** from a guideline for one condition. Provisional while it's only been read through a summary.

**Checked live, before every plan is saved** ([`src/quality.ts`](../src/quality.ts), ADR 0024): `ALL-1`, `KNEE-1`, `HIP-1`, `HAM-3`, `CALF-2`, `LBACK-1`, `LBACK-4`, `SHLDR-1`, `SHLDR-2` and `SHLDR-3`. A miss sends the plan back for another attempt. Every other criterion is graded offline only, by the eval harness. `SAFE-1` and `SAFE-2` (§4) also run live, as hard checks in `clinical.ts`.

### All regions

| Id | Criterion | Kind | Check | Sources |
|---|---|---|---|---|
| `ALL-1` | Includes at least one stretch and one strength exercise, when both categories are allowed | core | code | `AAOS-KNEE`, `AAOS-SHOULDER`, `AAOS-HIP`, `AAOS-SPINE`, `AAOS-FOOTANKLE`. Every program stretches and strengthens in the same session. |

### Knee

- **Rebound's muscles:** quadriceps, hamstrings, glutes, calves
- **AAOS targets:** quadriceps, hamstrings, abductors, adductors, gluteus medius and maximus (`AAOS-KNEE`)
- **Gap:** Rebound's knee mapping has no **abductors or adductors**, which AAOS targets.

| Id | Criterion | Kind | Check | Sources |
|---|---|---|---|---|
| `KNEE-1` | Includes at least one knee-targeted exercise (quadriceps or hamstrings) | core | code | `AAOS-KNEE` |
| `KNEE-2` | When strength is allowed, also includes at least one hip-targeted exercise (glutes or abductors) | condition-specific (patellofemoral pain), provisional | code | `APTA-PFP-2019` via AAFP; `AAOS-KNEE` |
| `KNEE-3` | *Replaced by `ALL-1`*, which asks the same of every region | — | — | — |

### Hip

- **Rebound's muscles:** glutes, abductors, adductors, quadriceps
- **AAOS targets:** gluteus maximus and medius, hamstrings, piriformis, adductors, abductors, tensor fascia (`AAOS-HIP`)
- **Gap:** no **hamstrings**.

| Id | Criterion | Kind | Check | Sources |
|---|---|---|---|---|
| `HIP-1` | Includes abductor or gluteus medius work when strength is allowed | core | code | `AAOS-HIP` |
| `HIP-2` | Combines strengthening with mobility or stretching | condition-specific (hip osteoarthritis: exercise therapy is grade A, individualised strengthening plus mobility), provisional | code | `APTA-HIPOA-2025` via Physiotutors; `AAOS-HIP` |

### Hamstring

- **Rebound's muscles:** hamstrings, glutes
- **No AAOS program** for this region. Hamstring stretches appear in `AAOS-KNEE` and `AAOS-HIP`.

| Id | Criterion | Kind | Check | Sources |
|---|---|---|---|---|
| `HAM-1` | When strength is allowed, includes eccentric hamstring or hip-extensor strengthening | condition-specific (hamstring strain in athletes, level B per the summary), provisional | judge, since "eccentric" isn't a catalogue field | `APTA-HAMSTRING-2022` via MEND and CAATE |
| `HAM-2` | Includes trunk or pelvic stabilisation work | condition-specific, provisional | code (abdominals or lower back) | `APTA-HAMSTRING-2022` via MEND |
| `HAM-3` | Includes a hamstring stretch | core | code | `AAOS-KNEE`, `AAOS-HIP` |

**Out of scope:** the guideline's progressive running and return-to-sport programme. Rebound doesn't prescribe running.

### Calf

- **Rebound's muscles:** calves
- **AAOS targets:** the gastrocnemius-soleus complex, among other muscles (`AAOS-FOOTANKLE`)

| Id | Criterion | Kind | Check | Sources |
|---|---|---|---|---|
| `CALF-1` | When strength is allowed, includes calf loading (a calf raise) | condition-specific (midportion Achilles tendinopathy: tendon loading as first-line treatment is grade A), provisional | code | `APTA-ACHILLES-2024` via excerpts; `AAOS-FOOTANKLE` |
| `CALF-2` | Includes a calf stretch, straight-knee or bent-knee | core | code | `AAOS-FOOTANKLE`, `AAOS-KNEE` |

**A real disagreement, kept visible.** The 2024 Achilles guideline recommends loads *"as high as tolerated"*, and its draft allowed activity within pain tolerance. AAOS says you should not feel pain during an exercise. Rebound sides with AAOS's conservatism. This goes to the expert; it isn't settled in this file.

### Ankle

- **Rebound's muscles:** calves only
- **AAOS targets:** calf, anterior and posterior tibialis, peroneus longus and brevis, and the plantar fascia, plus balance work (`AAOS-FOOTANKLE`)
- **Gap:** the mapping is narrow, and the catalogue has very little ankle work (see [Reference plans](#5-reference-plans)).

| Id | Criterion | Kind | Check | Sources |
|---|---|---|---|---|
| `ANKLE-1` | Includes ankle range of motion | core | code | `AAOS-FOOTANKLE` |
| `ANKLE-2` | Includes balance or proprioception work when the equipment allows | condition-specific (lateral ankle sprain, as secondary prevention: grade A per the summary), provisional | code | `APTA-ANKLE-2021` via OCS Field Guide; `AAOS-FOOTANKLE` |

### Lower back

- **Rebound's muscles:** lower back, abdominals, glutes
- **AAOS targets:** a wide list including hamstrings, latissimus dorsi, the obliques and quadratus lumborum (`AAOS-SPINE`)
- **Gap:** no **hamstrings**.

`APTA-LBP-2021` was read in full, so these are the strongest criteria in the file. Its grades: **A = should, B = may, C = can.** It gives no doses. Rebound's `onset` answer maps onto its acute/chronic split directly.

| Id | Criterion | Kind | Check | Sources |
|---|---|---|---|---|
| `LBACK-1` | **Chronic onset**, strength allowed: includes trunk strengthening and endurance work (for example a plank, side bridge or bridge). Grade A. | condition-specific, **primary** | code | `APTA-LBP-2021`; exercise examples from `AAOS-SPINE` |
| `LBACK-2` | **Acute onset:** trunk-muscle activation is acceptable but not required. Grade C, so it's never scored as a failure. | condition-specific, primary | judge | `APTA-LBP-2021` |
| `LBACK-3` | **Age 50+ and chronic onset:** general exercise training. Grade A. Any valid plan meets it, so it's recorded for completeness and not scored. | condition-specific, primary | — | `APTA-LBP-2021` |
| `LBACK-4` | Includes a mobility stretch for the spine or hips (knee to chest, rotation) | core | code | `AAOS-SPINE` |

### Shoulder

- **Rebound's muscles:** shoulders, traps
- **AAOS targets:** deltoids, trapezius, rhomboids, teres, supraspinatus, infraspinatus, subscapularis, biceps, triceps (`AAOS-SHOULDER`)
- **Gap:** no **middle back (rhomboids)**.

| Id | Criterion | Kind | Check | Sources |
|---|---|---|---|---|
| `SHLDR-1` | When strength is allowed, includes rotator-cuff rotation work (internal or external rotation) | core | code (by name, since the catalogue has no rotator-cuff field) | `AAOS-SHOULDER` |
| `SHLDR-2` | When strength is allowed, includes scapular work (trapezius, rhomboids or a horizontal abduction such as a reverse fly) | core | code | `AAOS-SHOULDER` |
| `SHLDR-3` | Includes a shoulder stretch | core | code | `AAOS-SHOULDER` |

The rotator-cuff guideline (`CPG-RC-2025`) is cited only until someone reads it.

### Neck

- **Rebound's muscles:** neck, traps
- **Gap:** the guideline's scapulothoracic and shoulder-girdle work is mostly outside this mapping.

| Id | Criterion | Kind | Check | Sources |
|---|---|---|---|---|
| `NECK-1` | Includes neck mobility (range of motion or a gentle stretch) | condition-specific (acute neck pain), provisional | code | `APTA-NECK-2017` via Physical Therapy First; `NHS-NECK` ("better to keep your neck moving"); `AAOS-SPINE` (head rolls) |
| `NECK-2` | When strength is allowed, includes scapulothoracic or shoulder-girdle strengthening or endurance work | condition-specific (acute to chronic neck pain), provisional | code | `APTA-NECK-2017` via Physical Therapy First |

### Elbow and wrist

**No criteria yet.** `APTA-ELBOW-2022` is cited only. The NHS trust leaflets found couldn't be read (one is a PDF the fetch couldn't extract text from), and nhsinform.scot refused automated requests. Until a source is read, plans for these two regions are graded on the code checks and dose benchmarks only, and the report says so.

---

## 4. Safety statements

The judge checks every plan's rationales against these. Each is a short quote, credited.

| Id | Statement | Check | Sources |
|---|---|---|---|
| `SAFE-1` | *"You should not feel pain during an exercise."* No rationale may encourage pushing through pain. | **live hard check** in `clinical.ts` for phrases like "push through the pain" or "no pain, no gain", plus the judge offline | `AAOS-KNEE`, `AAOS-SHOULDER`, `AAOS-HIP`, `AAOS-SPINE`, `AAOS-FOOTANKLE` |
| `SAFE-2` | No rationale claims an exercise treats, heals or cures a condition. | **live hard check** in `clinical.ts` (keywords), plus the judge offline | Internal: ADR 0016. Grounded in every source above presenting its programme as general conditioning *"under your doctor's supervision"* (`AAOS-*`). |
| `SAFE-3` | No rationale contradicts the plan's own limits or their reasons. For example, it doesn't call a plan "intense" when the limits allow stretching only. | judge | Internal: `clinical.ts` |
| `SAFE-4` | The pain-guidance wording a later screen may show: if it hurts during an exercise, stop and talk to a doctor or physical therapist. | Not graded. Recorded for F2's player and F3's escalation message. | `AAOS-*`; `NHS-NECK` (see a GP if it isn't better after a few weeks, or with pins and needles) |

---

## 5. Reference plans

Each AAOS exercise is matched to the closest exercise in Rebound's catalogue (`data/exercises.json`, the `stretching` and `strength` categories).

**How the matching was done:** by name and primary muscle only. Nobody has compared the catalogue's instructions with AAOS's. Ids are from the local JSON and haven't been checked against the seeded database.

| Match | Meaning |
|---|---|
| **close** | The same movement, as far as the name shows |
| **loose** | The same muscles, but a different setup or equipment |
| **none** | Nothing in the catalogue |

The harness compares plans with these by **muscle groups and dose ranges, not by exact id**, because the matching is too rough for id overlap to mean anything.

### `AAOS-KNEE`

| AAOS exercise | AAOS dose | Catalogue id | Match |
|---|---|---|---|
| Heel cord stretch | 2 × 4, 30 s hold | `Calf_Stretch_Hands_Against_Wall` | close |
| Standing quadriceps stretch | 2–3 × 30–60 s | `Standing_Elevated_Quad_Stretch` | loose |
| Supine hamstring stretch | 2–3 × 30–60 s | `Hamstring_Stretch` | close |
| Half squats | 3 × 10, 5 s hold | `Bodyweight_Squat` | loose (AAOS limits the depth) |
| Hamstring curls | 3 × 10, 5 s hold | `Standing_Leg_Curl` | loose (machine instead of ankle weight) |
| Calf raises | 2 × 10 | `Calf_Raises_-_With_Bands` | loose. **The catalogue has no bodyweight calf raise.** |
| Leg extensions | 3 × 10, 5 s hold | `Leg_Extensions` | loose (machine) |
| Straight-leg raises | 3 × 10, 5 s hold | — | none |
| Prone straight-leg raises | 3 × 10, 5 s hold | — | none |
| Hip abduction | 3 × 20, 5 s hold | `Thigh_Abductor` | loose (machine) |
| Hip adduction | 3 × 20, 5 s hold | `Band_Hip_Adductions` | loose (bands) |
| Leg presses | 3 × 10, 2 s hold | `Leg_Press` | loose (machine instead of band) |

### `AAOS-SHOULDER`

| AAOS exercise | AAOS dose | Catalogue id | Match |
|---|---|---|---|
| Pendulum | 2 × 10 | — | none |
| Crossover arm stretch | 4 × 30 s per side | `Shoulder_Stretch` | close. **Tagged `force = pull`, so Rebound doses it in reps**, the same issue as "90/90 Hamstring" in STATUS. |
| Passive internal and external rotation (stick) | 4 × 30 s per side | — | none |
| Sleeper stretch | 4 × 30 s, 3 times a day | — | none |
| Standing row (band) | 3 × 8 | `Seated_Cable_Rows` | loose (cable) |
| External rotation, arm abducted 90° (band) | 3 × 8 | `External_Rotation_with_Band` | loose (arm position) |
| Internal rotation (band) | 3 × 8 | `Internal_Rotation_with_Band` | close |
| External rotation (band) | 3 × 8 | `External_Rotation_with_Band` | close |
| Elbow flexion | 3 × 8 | `Alternate_Hammer_Curl` | loose |
| Elbow extension | 3 × 8 | `Standing_Dumbbell_Triceps_Extension` | loose |
| Trapezius strengthening | 3 × 20 | `Dumbbell_Shrug` | loose. **Movement not confirmed.** |
| Scapula setting | 10 × 10 s | — | none |
| Scapular retraction and protraction | 2 × 10 | — | none |
| Bent-over horizontal abduction | 3 × 8 | `Reverse_Flyes` | close |
| Internal and external rotation (weight) | 3–4 × 20 | `External_Rotation` | close (external only) |
| External rotation, lying down | 2 × 10 | `External_Rotation` | close |
| Internal rotation, lying down | 2 × 10 | — | none |

### `AAOS-HIP`

| AAOS exercise | AAOS dose | Catalogue id | Match |
|---|---|---|---|
| Standing iliotibial band stretch | 2 × 4 × 30 s | `IT_Band_and_Glute_Stretch` | loose |
| Seated rotation stretch | 2 × 4 × 30 s | `Seated_Glute` | loose (catalogue level: expert) |
| Knee to chest | 2 × 4 × 30 s | `One_Knee_To_Chest` | close |
| Supine hamstring stretch | 2 × 4 × 30–60 s | `Hamstring_Stretch` | close |
| Hip abduction | 8 → 12 reps, 5 s hold | `Thigh_Abductor` | loose (machine) |
| Hip adduction | 8 → 12 reps, 5 s hold | `Band_Hip_Adductions` | loose (bands) |
| Hip extension (prone) | 8 → 12 reps | `Hip_Extension_with_Bands` | loose (bands) |
| Clamshell | 1 × 10–15 per side, 5 s hold | — | none |
| Reverse clamshell | 1 × 10–15 per side | — | none |

### `AAOS-SPINE`

| AAOS exercise | AAOS dose | Catalogue id | Match |
|---|---|---|---|
| Head rolls | 3 × 3, 5 s per position | `Side_Neck_Stretch`, `Chin_To_Chest_Stretch` | loose |
| Kneeling back extension | 10 × 5 s | `Cat_Stretch` | loose |
| Sitting rotation stretch | 2 × 4 × 30 s | `Spinal_Stretch` | loose |
| Modified seat side straddle | 10 × 30 s per side | — | none confirmed |
| Knee to chest | 3 × 10 × 5 s | `One_Knee_To_Chest` | close |
| Bird dog | 5 × 15 s | — | none |
| Plank | 5 × 30 s | `Plank` | close (tagged `static`, so dosed as a hold, which matches) |
| Modified side plank | 5 × 15 s | `Side_Bridge` | close |
| Hip bridge | 5 × 15 s | `Butt_Lift_Bridge` | close. **Tagged `force = push`, so Rebound doses it in reps** where AAOS uses a 15 s hold. |
| Abdominal bracing | 5 × 15 s | — | none confirmed |
| Abdominal crunch | 2 × 10, 2 s hold | `Crunch_-_Hands_Overhead` | loose |

### `AAOS-FOOTANKLE`

| AAOS exercise | AAOS dose | Catalogue id | Match |
|---|---|---|---|
| Heel cord stretch | 2 × 10 × 30 s | `Calf_Stretch_Hands_Against_Wall` | close |
| Heel cord stretch, bent knee | 2 × 10 × 30 s | `Seated_Calf_Stretch` | loose |
| Golf ball roll | 2 min | — | none |
| Towel stretch | 2 × 10 × 30 s | — | none |
| Calf raises | 2 × 10 | `Calf_Raises_-_With_Bands` | loose. **No bodyweight calf raise.** |
| Ankle range of motion | 2 sets | `Ankle_Circles` | close |
| Marble pickup | 20 | — | none |
| Towel curls | 20 | — | none |
| Ankle dorsiflexion and plantar flexion (band) | 3 × 10 | — | none |
| Single-leg balance | 3–5 × up to 30 s | `Balance_Board` | loose (needs a board) |

---

## 6. Findings to raise

What scanning the sources turned up, before any plan has been graded. These are topics for the advisor update and the expert, **not changes to make yet**.

1. **Rebound's stretch holds are stricter than every source.** Its 30 s ceiling is AAOS's floor for knee and hip hamstring stretches. Its 50+ rule never lengthens holds, which runs against ACSM's guidance for older adults. (§2)
2. **Daily *loaded* strength work would exceed AAOS and ACSM.** AAOS does band and weight work 2–5 days a week, and ACSM novices train 2–3 days. AAOS does bodyweight core and calf work daily. The twice-daily loop needs a rule about which days carry loaded work. (§2)
3. **`region_muscles` is narrower than AAOS in five regions:** knee (no abductors or adductors), hip (no hamstrings), lower back (no hamstrings), shoulder (no middle back), and ankle (calves only). STATUS already lists this mapping as unreviewed; this is the first evidence about it. (§3)
4. **The catalogue can't express a lot of AAOS's programmes.**
   - Foot and ankle: 5 of 10 exercises have no match.
   - Shoulder: 7 of 18 have none (the passive internal and external rotation stretches share one row in §5).
   - Hip: both clamshells have none.
   - **There's no bodyweight calf raise**, so a calf or ankle plan for someone with no equipment can never include calf loading (`CALF-1`). (§5)
5. **Some catalogue `force` tags give the wrong unit.** `Shoulder_Stretch` and `Butt_Lift_Bridge` are dosed in reps where AAOS uses holds. This is the override list STATUS already anticipates. AAOS's "reps with a hold" style can't be expressed at all. (§2, §5)
6. **There's no warm-up and no in-session pain guidance.** AAOS has both in every programme. They belong to the session player (F2), not to plan generation. (§2, §4)
7. **Sources disagree about pain.** The Achilles guideline loads "as high as tolerated", while AAOS says no pain during exercise. Rebound sides with AAOS. That's a choice to put in front of the expert. (§3, Calf)

---

## Using this in generation

**Not now.** When it's tried:

- **Run it as an A/B experiment:** the current prompt against a prompt that also gets the region guidance. Both run through the same harness.
- **Keep the grading honest:**
  - Hold back some criteria from the prompt and grade on those too.
  - Report the held-back scores separately.
  - Have the expert grade a sample.
- **Get permission first.** Email OrthoInfo@aaos.org before any AAOS-derived text goes into a prompt, because a prompt sends it to Google.
- **Anything shown to users** is ADR 0016's territory: legal review before any citation appears on screen.

## Next steps for this file

- [ ] **Review every criterion.** Is it fair to grade a plan on it, given that Rebound doesn't diagnose?
- [ ] **Open the *Summary* sources in a browser** and promote each to *Primary*, or drop its criteria. Start with `APTA-PFP-2019`, `APTA-NECK-2017` and `APTA-ANKLE-2021`, because their criteria are the most specific.
- [ ] **Read `APTA-ELBOW-2022` and `CPG-RC-2025`** and add elbow and shoulder criteria.
- [ ] **Find a readable elbow and wrist source**, such as an NHS trust leaflet or NHS inform in a browser, and record its licence.
- [ ] **Add `KISNER-8` entries** with page numbers.
- [ ] **Find sources for the red flags** (`RED_FLAGS` in `clinical.ts`), which nothing here covers yet.
- [ ] **Compare the "close" catalogue matches' instructions** with AAOS's.
- [ ] **Convert to `references.ts`,** with `sources` as a required, non-empty field on every entry.
