import { collectMarketListings, collectTrends, getConnection } from "@radar/ml";
import { isDryRun, runJob } from "./lib/job";

await runJob("collect-ml", async () => {
  const conn = await getConnection();
  if (!conn.connected) throw new Error("Mercado Livre não conectado: conecte em Configurações no app.");
  if (isDryRun) {
    console.log(`[collect-ml] dry-run: conta ${conn.nickname}; nada será gravado`);
    return 0;
  }
  const r = await collectMarketListings();
  console.log(`[collect-ml] ${r.products} produtos, ${r.listings} anúncios (fonte: ${[...r.source].join(", ") || "-"})`);
  let trends = 0;
  try {
    trends = await collectTrends();
    console.log(`[collect-ml] ${trends} termos em alta`);
  } catch (err) {
    r.errors.push(`tendências: ${(err as Error).message}`);
  }
  if (r.errors.length) {
    // erro parcial: grava o que deu certo, mas marca o job como erro para aparecer no dashboard
    throw new Error(`${r.listings} anúncios gravados, mas com falhas:\n${r.errors.join("\n")}`);
  }
  return r.listings + trends;
});
