/**
 * Checks the required environment variables once at startup, so a missing key
 * fails with a readable message instead of an error deep inside a request.
 */

type RequiredEnv = {
  DATABASE_URL: string;
  GEMINI_API_KEY: string;
};

const REQUIRED: { key: keyof RequiredEnv; hint: string }[] = [
  {
    key: "DATABASE_URL",
    hint: "Supabase dashboard -> Connect -> Transaction pooler (port 6543).",
  },
  {
    key: "GEMINI_API_KEY",
    hint: "https://aistudio.google.com/apikey",
  },
];

export function loadEnv(): RequiredEnv & { API_PORT: number } {
  const missing = REQUIRED.filter(({ key }) => !process.env[key]?.trim());

  if (missing.length > 0) {
    const lines = [
      "",
      `Missing required environment variable${missing.length > 1 ? "s" : ""}:`,
      "",
      ...missing.map(({ key, hint }) => `  ${key}\n    ${hint}`),
      "",
      "Copy .env.example to .env at the repo root and fill these in.",
      "Note: .env is read once at process start, so changing it needs a restart.",
      "",
    ];
    console.error(lines.join("\n"));
    process.exit(1);
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY!,
    API_PORT: Number(process.env.API_PORT ?? 4000),
  };
}
