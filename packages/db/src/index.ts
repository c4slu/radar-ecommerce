import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

let cached: ReturnType<typeof createDb> | undefined;

function createDb(url: string) {
  // prepare:false é exigido pelo pooler (modo transaction) do Supabase
  const client = postgres(url, { prepare: false, max: 5 });
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
