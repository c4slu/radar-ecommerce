import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { getDb, jobRuns, products, suppliers } from "@radar/db";
import { Badge, EmptyState, Td } from "@/components/ui";
import { brl, num } from "@/lib/format";
import { getStockSummaries } from "@/lib/stock";
import { loadOpportunities } from "@/lib/opportunities";
import { supabaseConfigured } from "@/lib/supabase/server";
import { signOut } from "./login/actions";

export const dynamic = "force-dynamic";

async function loadStats() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const db = getDb();
    const [productRows, [s], runs, stock] = await Promise.all([
      db.select({ id: products.id, name: products.name, status: products.status }).from(products),
      db.select({ n: count() }).from(suppliers),
      db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(8),
      getStockSummaries(),
    ]);
    const byStatus = Object.groupBy(productRows, (p) => p.status);
    const names = new Map(productRows.map((p) => [p.id, p.name]));
    let stockValue = 0;
    const lowStock: { id: string; name: string; days: number; balance: number }[] = [];
    for (const [id, st] of stock) {
      stockValue += st.stockValue;
      if (st.coverageDays != null && st.coverageDays < 15)
        lowStock.push({ id, name: names.get(id) ?? "?", days: st.coverageDays, balance: st.balance });
    }
    // oportunidades: opcional (tabelas podem não existir ainda neste banco)
    const opps = await loadOpportunities()
      .then((r) => r.items.filter((o) => o.listings <= 5).sort((a, b) => b.result.score - a.result.score).slice(0, 5))
      .catch(() => [] as Awaited<ReturnType<typeof loadOpportunities>>["items"]);
    return {
      opps,
      researching: byStatus.pesquisa?.length ?? 0,
      active: byStatus.ativo?.length ?? 0,
      approved: byStatus.aprovado?.length ?? 0,
      suppliers: s?.n ?? 0,
      stockValue,
      lowStock: lowStock.sort((a, b) => a.days - b.days),
      runs,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function Dashboard() {
  const stats = await loadStats();
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {supabaseConfigured() && (
          <form action={signOut}>
            <button className="text-sm text-zinc-500 hover:underline">Sair</button>
          </form>
        )}
      </header>

      {!stats ? (
        <div className="card border-amber-300 text-sm">
          <p className="font-medium">Banco ainda não configurado.</p>
          <p className="mt-1 text-zinc-500">
            Preencha <code>DATABASE_URL</code> no <code>.env</code> da raiz do projeto e rode <code>npm run db:migrate</code>.
          </p>
        </div>
      ) : "error" in stats ? (
        <div className="card text-sm text-red-600">Erro ao conectar no banco: {stats.error}</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Em pesquisa" value={num(stats.researching)} href="/produtos" />
            <Stat label="Aprovados p/ compra" value={num(stats.approved)} href="/produtos" />
            <Stat label="Ativos" value={num(stats.active)} href="/produtos" />
            <Stat label="Fornecedores" value={num(stats.suppliers)} href="/fornecedores" />
            <Stat label="Capital em estoque" value={brl(stats.stockValue)} href="/estoque" />
          </div>

          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">Melhores oportunidades hoje</h2>
              <Link href="/oportunidades" className="text-sm text-zinc-500 hover:underline">
                ver todas
              </Link>
            </div>
            {stats.opps.length === 0 ? (
              <EmptyState>Sem dados de oportunidades ainda. Rode a coleta collect-opportunities.</EmptyState>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {stats.opps.map((o) => (
                    <tr key={o.id} className="border-t border-zinc-100 first:border-0 dark:border-zinc-800">
                      <Td>
                        <Link href={`/oportunidades/${o.id}`} className="line-clamp-1 hover:underline">
                          {o.name}
                        </Link>
                      </Td>
                      <Td right>#{o.position}</Td>
                      <Td right>{o.listings} anúncios</Td>
                      <Td right>{brl(o.priceMedian ?? o.priceMin)}</Td>
                      <Td right className="font-semibold">
                        {o.result.score}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="card">
              <h2 className="mb-3 font-medium">Repor estoque (cobertura &lt; 15 dias)</h2>
              {stats.lowStock.length === 0 ? (
                <EmptyState>Nenhum produto precisando de reposição.</EmptyState>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {stats.lowStock.map((l) => (
                      <tr key={l.id} className="border-t border-zinc-100 first:border-0 dark:border-zinc-800">
                        <Td>
                          <Link href={`/produtos/${l.id}`} className="hover:underline">
                            {l.name}
                          </Link>
                        </Td>
                        <Td right>{num(l.balance)} un.</Td>
                        <Td right className="font-medium text-red-600">
                          {Math.round(l.days)} dias
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card">
              <h2 className="mb-3 font-medium">Últimos jobs</h2>
              {stats.runs.length === 0 ? (
                <EmptyState>Nenhum job executado ainda.</EmptyState>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {stats.runs.map((r) => (
                      <tr key={r.id} className="border-t border-zinc-100 first:border-0 dark:border-zinc-800">
                        <Td>{r.job}</Td>
                        <Td>
                          <Badge tone={r.status === "error" ? "red" : r.status === "success" ? "green" : "zinc"}>{r.status}</Badge>
                        </Td>
                        <Td className="text-zinc-500">{r.startedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</Td>
                        <Td right>{r.itemsProcessed ?? "-"} itens</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link href={href} className="card block hover:border-zinc-400">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </Link>
  );
}
