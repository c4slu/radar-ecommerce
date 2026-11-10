/**
 * Prepara um banco do zero (ou atualiza um existente) com um comando:
 *   1. aplica as migrations do Drizzle (tabelas)
 *   2. aplica packages/db/sql/*.sql em ordem (RLS, funções, pg_cron, seeds) — todos idempotentes
 * Uso: npm run db:setup   (usa .env.local se existir, senão .env)
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { devPointsToProd } from "./env-guard";

const here = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida (.env.local ou .env)");

if (devPointsToProd(path.join(here, "../../.."))) {
  console.error(
    "[db:setup] PARADO: o .env.local aponta para o MESMO banco do .env (produção). Troque NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e DATABASE_URL do .env.local pelos do projeto radar-dev.",
  );
  process.exit(1);
}

const host = new URL(url);
console.log(`[db:setup] banco: ${host.username.split(".")[1] ?? host.hostname} (${process.env.RADAR_ENV ?? "sem RADAR_ENV"})`);

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder: path.join(here, "../migrations") });
  console.log("[db:setup] migrations aplicadas");

  const dir = path.join(here, "../sql");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await sql.unsafe(readFileSync(path.join(dir, file), "utf8"));
      console.log(`[db:setup] ${file} ok`);
    } catch (err) {
      const msg = (err as Error).message;
      // pg_cron precisa ser ativado no painel (Database > Extensions) antes
      if (/cron/i.test(msg)) console.warn(`[db:setup] ${file}: ative a extensão pg_cron no Supabase e rode de novo (${msg})`);
      else throw new Error(`${file}: ${msg}`);
    }
  }
  console.log("[db:setup] pronto");
} finally {
  await sql.end();
}
