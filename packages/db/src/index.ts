import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

function createDb(url: string) {
  // Use o Session pooler do Supabase (porta 5432): no modo transaction (6543) as queries
  // em paralelo ficam presas ao abrir conexões novas. prepare:false mantém compatível com os dois.
  if (new URL(url).port === "6543")
    console.warn("[db] DATABASE_URL usa a porta 6543 (transaction pooler); troque para 5432 (session pooler)");
  // O Session pooler do plano grátis aceita só 15 clientes no total (app local + Vercel + jobs).
  // Pool pequeno e conexões ociosas fechadas em 20s para não esgotar.
  const client = postgres(url, {
    prepare: false,
    max: Number(process.env.DB_POOL_MAX ?? 3),
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
  });
  return drizzle(client, { schema });
}

type DbInstance = ReturnType<typeof createDb>;
// Guardado no escopo global: o modo dev do Next recarrega os módulos a cada mudança,
// e sem isso cada recarga abria um pool novo sem fechar o anterior (vazamento de conexões).
const globalForDb = globalThis as unknown as { __radarDb?: { url: string; db: DbInstance } };

/** Conexão única por processo. Use apenas no servidor / jobs. */
export function getDb(): DbInstance {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida (veja .env.example)");
  if (globalForDb.__radarDb?.url !== url) globalForDb.__radarDb = { url, db: createDb(url) };
  return globalForDb.__radarDb.db;
}

export type Db = ReturnType<typeof getDb>;

export { saveMarketListings, refreshTodaySnapshots, type ListingInput } from "./market";
