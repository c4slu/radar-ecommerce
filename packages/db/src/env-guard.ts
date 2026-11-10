import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const read = (file: string) =>
  existsSync(file)
    ? Object.fromEntries(
        readFileSync(file, "utf8")
          .split(/\r?\n/)
          .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
          .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
      )
    : {};

const projectRef = (url?: string) => {
  try {
    const u = new URL(url ?? "");
    return u.username.split(".")[1] ?? u.hostname;
  } catch {
    return null;
  }
};

/**
 * true quando o .env.local (desenvolvimento) aponta para o mesmo banco do .env (produção):
 * é o erro de copiar o .env sem trocar os dados do Supabase.
 */
export function devPointsToProd(rootDir: string): boolean {
  const local = read(path.join(rootDir, ".env.local"));
  const prod = read(path.join(rootDir, ".env"));
  const a = projectRef(local.DATABASE_URL);
  const b = projectRef(prod.DATABASE_URL);
  return !!a && a === b;
}
