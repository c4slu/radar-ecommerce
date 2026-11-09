import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { computeRisk, parseLocaleNumber } from "@radar/core";
import { getDb, trendSignals } from "@radar/db";
import { listingStats, type MarketSearchResult } from "@radar/core";
import { shopeeConfigured } from "@radar/shopee";
import { SubmitButton } from "@/components/action-form";
import { Badge, EmptyState, PageHeader, Td, Th } from "@/components/ui";
import { getActiveFeeRules, getSettings } from "@/lib/data";
import { brl, num, pct } from "@/lib/format";
import { MARKETPLACE_NAME, searchMarket, type SearchMarketplace } from "@/lib/market";
import { trackTerm } from "./actions";

export const dynamic = "force-dynamic";

type Search = { q?: string; mp?: string; custo?: string; lote?: string; vendas?: string };

const LEVEL_TONE = { baixo: "green", medio: "amber", alto: "red" } as const;

export default async function ResearchPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const cost = parseLocaleNumber(sp.custo);
  const lot = parseLocaleNumber(sp.lote) ?? 100;
  const dailySales = parseLocaleNumber(sp.vendas);
  const mp: SearchMarketplace = sp.mp === "mercadolivre" || sp.mp === "shopee" ? sp.mp : shopeeConfigured() ? "shopee" : "mercadolivre";

  let result: MarketSearchResult | null = null;
  let error: string | null = null;
  if (q) {
    try {
      result = await searchMarket(mp, q);
    } catch (err) {
      error = (err as Error).message;
    }
  }
  const trends = await latestTrends();

  return (
    <div className="space-y-6">
      <PageHeader title="Pesquisa de mercado" subtitle="Veja concorrentes, faixa de preço e risco na Shopee e no Mercado Livre antes de cotar um produto." />

      <form className="card grid gap-3 sm:grid-cols-[150px_1fr_140px_110px_140px_auto] sm:items-end">
        <label className="block">
          <span className="label">Marketplace</span>
          <select name="mp" defaultValue={mp} className="input">
            <option value="shopee">Shopee</option>
            <option value="mercadolivre">Mercado Livre</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Produto / termo de busca</span>
          <input name="q" defaultValue={q} required className="input" placeholder="garrafa térmica 500ml" />
        </label>
        <label className="block">
          <span className="label">Seu custo/un (R$)</span>
          <input name="custo" defaultValue={sp.custo ?? ""} className="input" inputMode="decimal" placeholder="opcional" />
        </label>
        <label className="block">
          <span className="label">Lote (un)</span>
          <input name="lote" defaultValue={sp.lote ?? "100"} className="input" inputMode="numeric" />
        </label>
        <label className="block">
          <span className="label">Vendas/dia do mercado</span>
          <input name="vendas" defaultValue={sp.vendas ?? ""} className="input" inputMode="decimal" placeholder="se souber" />
        </label>
        <button className="btn">Pesquisar</button>
      </form>

      {error && (
        <div className="card text-sm text-red-600">
          {error}
          {/não conectado|não configurada/i.test(error) && (
            <>
              {" "}
              <Link href="/configuracoes" className="underline">
                Ir para Configurações
              </Link>
            </>
          )}
        </div>
      )}

      {result && <Results q={q} result={result} cost={cost} lot={lot} dailySales={dailySales} />}

      {!q && (
        <div className="card">
          <h2 className="mb-3 font-medium">Em alta no Mercado Livre</h2>
          {trends.length === 0 ? (
            <EmptyState>Ainda sem tendências: elas chegam com o job collect-ml depois de conectar o Mercado Livre.</EmptyState>
          ) : (
            <div className="flex flex-wrap gap-2">
              {trends.map((t) => (
                <Link
                  key={t.term}
                  href={`/pesquisa?q=${encodeURIComponent(t.term)}`}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <span className="text-zinc-400">{t.value}.</span> {t.term}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

async function latestTrends() {
  const db = getDb();
  const [last] = await db
    .select({ day: trendSignals.day })
    .from(trendSignals)
    .where(eq(trendSignals.source, "ml_trends"))
    .orderBy(desc(trendSignals.day))
    .limit(1);
  if (!last) return [];
  return db
    .select({ term: trendSignals.term, value: trendSignals.value })
    .from(trendSignals)
    .where(and(eq(trendSignals.source, "ml_trends"), eq(trendSignals.day, last.day)))
    .orderBy(asc(trendSignals.value))
    .limit(40);
}

async function Results({
  q,
  result,
  cost,
  lot,
  dailySales,
}: {
  q: string;
  result: MarketSearchResult;
  cost?: number;
  lot: number;
  dailySales?: number;
}) {
  const stats = listingStats(result.listings);
  const [settings, feeRules] = await Promise.all([getSettings(), getActiveFeeRules()]);
  const categories = new Map<string, number>();
  for (const l of result.listings) if (l.categoryId) categories.set(l.categoryId, (categories.get(l.categoryId) ?? 0) + 1);
  const isMl = result.marketplace === "mercadolivre";
  const topCategory = isMl ? ([...categories.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null) : null;

  const risk =
    cost != null && Number.isFinite(cost) && stats.count > 0
      ? computeRisk({
          marketplace: result.marketplace,
          feeRules,
          categoryId: topCategory,
          landedCost: cost,
          taxPct: settings.taxPct,
          marketPrices: result.listings.map((l) => l.price),
          sellerCountHistory: [stats.sellers],
          officialSellerShare: stats.officialShare,
          marketDailySales: dailySales,
          lotQty: lot,
          expectedShare: settings.expectedShare,
          targetMargin: settings.targetMargin,
          maxDaysToSell: settings.maxDaysToSell,
          coverageDays: settings.coverageDays,
          weights: settings.riskWeights,
        })
      : null;

  const sorted = [...result.listings].sort((a, b) => a.price - b.price);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Anúncios analisados" value={`${num(stats.count)} de ${num(result.total)}`} />
        <Kpi label="Vendedores" value={num(stats.sellers)} />
        <Kpi label="Menor preço" value={brl(stats.priceMin)} />
        <Kpi label="Mediana" value={brl(stats.priceMedian)} />
        <Kpi label="Maior preço" value={brl(stats.priceMax)} />
        <Kpi label={isMl ? "Loja oficial / Full" : "Mall / Indicado"} value={pct(stats.officialShare, 0)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="card">
          <h2 className="mb-1 font-medium">Risco simulado</h2>
          {!risk ? (
            <p className="text-sm text-zinc-500">Informe seu custo por unidade acima para simular margem e risco.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <span className="text-4xl font-bold">{risk.score}</span>
                <Badge tone={LEVEL_TONE[risk.level]}>risco {risk.level}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-xs text-zinc-500">Margem na mediana</div>
                  {pct(risk.marginAtMedian)}
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Preço sugerido</div>
                  {brl(risk.suggestedPrice)}
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Preço mínimo</div>
                  {brl(risk.breakEvenPrice)}
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Capital no lote</div>
                  {brl(risk.capitalAtRisk)}
                </div>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {risk.explanation.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
              <p className="text-xs text-zinc-500">
                Demanda e giro ficam neutros até haver histórico: depois de acompanhar o produto, os coletores medem a evolução das vendas.
              </p>
            </div>
          )}
        </div>
        <div className="card space-y-3 text-sm">
          <h2 className="font-medium">Acompanhar este produto</h2>
          <p className="text-zinc-500">
            Cria um produto em pesquisa com o termo <strong>{q}</strong>, coleta os concorrentes agora nos marketplaces configurados e passa a monitorar a cada 6 horas.
          </p>
          <form action={trackTerm.bind(null, q, topCategory)}>
            <SubmitButton label="Acompanhar" />
          </form>
          <p className="text-xs text-zinc-400">
            Fonte: {MARKETPLACE_NAME[result.marketplace]} ({result.source === "search" ? "busca" : result.source === "catalog" ? "catálogo" : "API de afiliados"})
            {topCategory && ` · categoria ${topCategory}`}
          </p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-3 font-medium">Concorrentes (do mais barato ao mais caro)</h2>
        {sorted.length === 0 ? (
          <EmptyState>Nenhum anúncio encontrado.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Anúncio</Th>
                <Th right>Preço</Th>
                <Th right>Vendidos</Th>
                <Th>Vendedor</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((l) => (
                <tr key={l.externalId} className="border-t border-zinc-100 dark:border-zinc-800">
                  <Td>
                    {l.url ? (
                      <a href={l.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {l.title}
                      </a>
                    ) : (
                      l.title
                    )}
                  </Td>
                  <Td right>{brl(l.price)}</Td>
                  <Td right>{num(l.soldQuantity)}</Td>
                  <Td className="text-zinc-500">{l.sellerName ?? l.sellerId ?? "-"}</Td>
                  <Td>
                    <div className="flex gap-1">
                      {l.isOfficialStore && <Badge tone="blue">{isMl ? "oficial" : "mall"}</Badge>}
                      {l.isFulfillment && <Badge tone="green">{isMl ? "full" : "indicado"}</Badge>}
                      {l.freeShipping && <Badge>frete grátis</Badge>}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
