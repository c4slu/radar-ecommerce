import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import { devPointsToProd } from "../../packages/db/src/env-guard";

// Os .env ficam na raiz do monorepo (compartilhados com os jobs), não em apps/web.
// .env.local (banco/credenciais de desenvolvimento) é lido primeiro e vence o .env;
// loadEnvFile não sobrescreve variáveis já definidas (ex.: as da Vercel).
for (const file of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), "../..", file);
  if (existsSync(full)) process.loadEnvFile(full);
}

// trava: .env.local copiado do .env sem trocar o banco -> a barra lateral avisa em vermelho
if (devPointsToProd(path.resolve(process.cwd(), "../.."))) process.env.RADAR_DEV_ON_PROD = "1";

const config: NextConfig = {
  // radar.localtest.me aponta para 127.0.0.1: endereço local que o Mercado Livre aceita como retorno do OAuth
  // (ele recusa "localhost"). O modo dev do Next só aceita outras origens se listadas aqui.
  allowedDevOrigins: ["radar.localtest.me"],
  transpilePackages: ["@radar/core", "@radar/db", "@radar/ml", "@radar/shopee", "@radar/suppliers"],
};

export default config;
