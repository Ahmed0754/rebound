/**
 * Fail loudly and readably on missing configuration, at startup, before
 * anything else runs.
 *
 * v1 omitted GEMINI_API_KEY — the production model provider — from every
 * .env.example and from the build environment allowlist, so a new developer
 * cloning the repo hit a silent failure with no useful error.
 */

type Required = {
  DATABASE_URL: string;
  GEMINI_API_KEY: string;
};

const REQUIRED: { key: keyof Required; hint: string }[] = [
  {
    key: "DATABASE_URL",
    hint: "Supabase dashboard -> Connect -> Transaction pooler (port 6543).",
  },
  {
    key: "GEMINI_API_KEY",
    hint: "https://aistudio.google.com/apikey",
  },
];

export function loadEnv(): Required & { GEMINI_MODEL: string; API_PORT: number } {
  const missing = REQUIRED.filter(({ key }) => !process.env[key]?.trim());

  if (missing.length > 0) {
    const lines = [
      "",
      `Missing required environment variable${missing.length > 1 ? "s" : ""}:`,
      "",
      ...missing.map(({ key, hint }) => `  ${key}\n    ${hint}`),
      "",
      "Copy .env.example to .env at the repo root and fill these in.",
      "Note: .env is read once at process start. Changing it needs a full",
      "restart, not a hot reload.",
      "",
    ];
    console.error(lines.join("\n"));
    process.exit(1);
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY!,
    GEMINI_MODEL: process.env.GEMINI_MODEL ?? "gemini-3.7-flash",
    API_PORT: Number(process.env.API_PORT ?? 4000),
  };
}
