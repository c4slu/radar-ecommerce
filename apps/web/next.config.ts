import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// O .env fica na raiz do monorepo (compartilhado com os jobs), não em apps/web.
// loadEnvFile não sobrescreve variáveis já definidas (ex.: as da Vercel).
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  transpilePackages: ["@radar/core", "@radar/db", "@radar/ml", "@radar/shopee"],
};

export default config;
