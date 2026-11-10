/**
 * Coleta de oportunidades no catálogo do ML.
 *   npm run collect:opportunities                 coleta diária (todas as categorias habilitadas)
 *   npm run collect:opportunities -- --sync       atualiza a árvore de categorias (semanal)
 *   npm run collect:opportunities -- --limit 5    só as 5 primeiras categorias (teste)
 *   npm run collect:opportunities -- --dry-run    lê do ML e mostra, sem gravar nada
 */
import { collectBestsellers, getConnection, syncCategoryTree } from "@radar/ml";
import { isDryRun, runJob } from "./lib/job";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const sync = process.argv.includes("--sync");
const limit = arg("--limit") ? Number(arg("--limit")) : undefined;

await runJob(sync ? "sync-ml-categories" : "collect-opportunities", async () => {
  const conn = await getConnection();
  if (!conn.connected) throw new Error("Mercado Livre não conectado: conecte em Configurações no app.");
  if (sync) {
    if (isDryRun) throw new Error("--sync não tem dry-run");
    const n = await syncCategoryTree();
    console.log(`[categorias] ${n} categorias sincronizadas`);
    return n;
  }
  const started = Date.now();
  const r = await collectBestsellers({ limitCategories: limit, dryRun: isDryRun, log: (m) => console.log(`[oportunidades] ${m}`) });
  console.log(
    `[oportunidades] ${r.categories} categorias, ${r.ranks} posições, ${r.snapshots} produtos (${r.newProducts} novos) em ${Math.round((Date.now() - started) / 1000)}s`,
  );
  if (r.sample) console.table(r.sample.map((s) => ({ produto: s.name.slice(0, 60), anuncios: s.listings, menor_preco: s.priceMin })));
  if (r.errors.length) {
    console.warn(`[oportunidades] ${r.errors.length} falhas, ex.: ${r.errors.slice(0, 3).join(" | ")}`);
    // falhas pontuais não derrubam a coleta; só se a maioria falhou
    if (r.errors.length > r.snapshots) throw new Error(`Muitas falhas: ${r.errors.slice(0, 5).join("\n")}`);
  }
  return r.snapshots;
});
