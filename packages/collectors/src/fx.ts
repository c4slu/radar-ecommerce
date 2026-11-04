import { fetchJson, isDryRun, runJob } from "./lib/job";
import { fxRates, getDb } from "@radar/db";
import { sql } from "drizzle-orm";

// AwesomeAPI: gratuita, sem chave. https://docs.awesomeapi.com.br/api-de-moedas
const PAIRS = ["USD-BRL", "CNY-BRL"];

type AwesomeResponse = Record<string, { code: string; codein: string; bid: string; create_date: string }>;

await runJob("collect-fx", async () => {
  const data = await fetchJson<AwesomeResponse>(`https://economia.awesomeapi.com.br/json/last/${PAIRS.join(",")}`);
  const rows = Object.values(data).map((q) => ({
    pair: `${q.code}-${q.codein}`,
    rate: Number(q.bid),
    day: q.create_date.slice(0, 10),
  }));
  if (isDryRun) {
    console.table(rows);
    return rows.length;
  }
  await getDb()
    .insert(fxRates)
    .values(rows)
    .onConflictDoUpdate({ target: [fxRates.pair, fxRates.day], set: { rate: sql`excluded.rate` } });
  return rows.length;
});
