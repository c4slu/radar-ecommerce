import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

let cached: ReturnType<typeof createDb> | undefined;

function createDb(url: string) {
  // Use o Session pooler do Supabase (porta 5432): no modo transaction (6543) as queries
  // em paralelo ficam presas ao abrir conexões novas. prepare:false mantém compatível com os dois.
  if (new URL(url).port === "6543")
    console.warn("[db] DATABASE_URL usa a porta 6543 (transaction pooler); troque para 5432 (session pooler)");
  const client = postgres(url, { prepare: false, max: 5, connect_timeout: 10 });
  return drizzle(client, { schema });
}

/** Conexão única por processo. Use apenas no servidor / jobs. */
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida (veja .env.example)");
  cached ??= createDb(url);
  return cached;
}

export type Db = ReturnType<typeof getDb>;

export { saveMarketListings, refreshTodaySnapshots, type ListingInput } from "./market";
