// The signs that mean stopping the exercises and seeing someone. Most are the
// warning signs the questionnaire screens for (RED_FLAGS in lib/questionnaire),
// shortened to statements; the first is the plain one every plan relies on.
// Shown on a plan's printed sheet.

const SIGNS = [
  "Pain that gets sharply worse during an exercise",
  "Numbness, tingling or weakness, or a limb giving way",
  "Pain that wakes you at night or stays bad at rest",
  "Fever, or weight loss you can't explain",
  "Chest pain when you exert yourself",
];

export function WhenToStop({ className }: { className?: string }) {
  return (
    <section className={className}>
      <h3>When to stop</h3>
      <p>Stop the exercises and see a doctor or physio if you notice:</p>
      <ul>
        {SIGNS.map((sign) => (
          <li key={sign}>{sign}</li>
        ))}
      </ul>
    </section>
  );
}
