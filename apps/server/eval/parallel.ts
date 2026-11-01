// Runs async work a few at a time, keeping the results in input order. The
// eval's calls are independent of each other, and one at a time is most of
// why a full run took hours (`--concurrency` on `pnpm eval` and
// `pnpm eval:judge`).

/** `fn` over every item, at most `limit` at once; results in input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

/** `--concurrency N` from the command line, or `fallback`. */
export function concurrencyWanted(fallback: number): number {
  const at = process.argv.indexOf("--concurrency");
  const value = at === -1 ? fallback : Number(process.argv[at + 1]);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--concurrency needs a whole number of at least 1, not ${process.argv[at + 1]}`);
  }

  return value;
}
