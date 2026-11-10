/** Atualiza os catálogos (XML/CSV) dos fornecedores nacionais: preço e estoque do dia. */
import { syncAllFeeds } from "@radar/suppliers";
import { isDryRun, runJob } from "./lib/job";

await runJob("sync-supplier-feeds", async () => {
  if (isDryRun) {
    console.log("[catálogos] dry-run não disponível: a sincronização sempre grava");
    return 0;
  }
  const results = await syncAllFeeds();
  for (const r of results) console.log(`[catálogos] ${r.name}: ${r.error ? `ERRO ${r.error}` : `${r.items} produtos, ${r.removed} removidos`}`);
  const failed = results.filter((r) => r.error);
  if (failed.length && failed.length === results.length) throw new Error(`Todos os catálogos falharam: ${failed.map((f) => f.name).join(", ")}`);
  return results.reduce((a, r) => a + r.items, 0);
});
