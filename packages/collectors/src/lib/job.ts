import { eq } from "drizzle-orm";
import { getDb, jobRuns } from "@radar/db";

export const isDryRun = process.argv.includes("--dry-run");

/**
 * Executa um job registrando início/fim/erro em `job_runs`.
 * Com --dry-run não toca no banco: só imprime o que faria.
 */
export async function runJob(name: string, fn: () => Promise<number>): Promise<void> {
  if (isDryRun) {
    const n = await fn();
    console.log(`[${name}] dry-run: ${n} itens`);
    return;
  }
  const db = getDb();
  const [run] = await db.insert(jobRuns).values({ job: name }).returning({ id: jobRuns.id });
  try {
    const n = await fn();
    await db
      .update(jobRuns)
      .set({ status: "success", finishedAt: new Date(), itemsProcessed: n })
      .where(eq(jobRuns.id, run!.id));
    console.log(`[${name}] ok: ${n} itens`);
  } catch (err) {
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
    await db.update(jobRuns).set({ status: "error", finishedAt: new Date(), error: msg }).where(eq(jobRuns.id, run!.id));
    console.error(`[${name}] erro:`, msg);
    process.exitCode = 1;
  } finally {
    await getDb().$client.end();
  }
}

/** fetch com timeout e retry exponencial simples. */
export async function fetchJson<T>(url: string, init: RequestInit = {}, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}: ${(await res.text()).slice(0, 200)}`);
      return (await res.json()) as T;
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}
