import Link from "next/link";
import { count, desc, gte } from "drizzle-orm";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Calculator,
  CheckCircle2,
  Clock,
  Package,
  Search,
  Sparkles,
  DollarSign,
  Wallet,
  XCircle,
} from "lucide-react";
import { fxRates, getDb, jobRuns, products, suppliers } from "@radar/db";
import { CategoryBars, Donut, Histogram, TrendLines } from "@/components/charts";
import { Badge, CardTitle, EmptyState, StatCard, Td, Th } from "@/components/ui";
import { brl, num } from "@/lib/format";
import { categoryTree, loadOpportunities } from "@/lib/opportunities";
import { getStockSummaries } from "@/lib/stock";

export const dynamic = "force-dynamic";

type Opps = Awaited<ReturnType<typeof loadOpportunities>>["items"];

async function loadDashboard() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const db = getDb();
    const since = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10);
    const [productRows, [s], runs, stock, fx] = await Promise.all([
      db.select({ id: products.id, name: products.name, status: products.status }).from(products),
      db.select({ n: count() }).from(suppliers),
      db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(6),
      getStockSummaries(),
      db.select().from(fxRates).where(gte(fxRates.day, since)).orderBy(fxRates.day),
    ]);
    // oportunidades são opcionais: as tabelas podem não existir ainda neste banco
    const [opp, tree] = await Promise.all([
      loadOpportunities().catch(() => ({ day: null, items: [] as Opps })),
      categoryTree().catch(() => null),
    ]);

    const byStatus = Object.groupBy(productRows, (p) => p.status);
    const names = new Map(productRows.map((p) => [p.id, p.name]));
    let stockValue = 0;
    let stockUnits = 0;
    const lowStock: { id: string; name: string; days: number; balance: number }[] = [];
    for (const [id, st] of stock) {
      stockValue += st.stockValue;
      stockUnits += Math.max(0, st.balance);
      if (st.coverageDays != null && st.coverageDays < 15) lowStock.push({ id, name: names.get(id) ?? "?", days: st.coverageDays, balance: st.balance });
    }

    // câmbio: uma linha por dia com USD e CNY
    const fxByDay = new Map<string, { label: string; usd: number | null; cny: number | null }>();
    for (const r of fx) {
      const row = fxByDay.get(r.day) ?? { label: `${r.day.slice(8, 10)}/${r.day.slice(5, 7)}`, usd: null, cny: null };
      if (r.pair === "USD-BRL") row.usd = r.rate;
      if (r.pair === "CNY-BRL") row.cny = r.rate;
      fxByDay.set(r.day, row);
    }

    // oportunidades por categoria raiz (fortes x boas) e distribuição dos scores
    const items = opp.items;
    const perCat = new Map<string, { name: string; forte: number; boa: number }>();
    for (const o of items) {
      if (o.result.level === "fraca") continue;
      const root = tree?.rootOf(o.categoryId) ?? o.categoryId;
      const row = perCat.get(root) ?? { name: tree?.byId.get(root)?.name ?? root, forte: 0, boa: 0 };
      row[o.result.level]++;
      perCat.set(root, row);
    }
    const buckets = [
      { name: "0–39", min: 0, max: 39, color: "var(--chart-5)" },
      { name: "40–49", min: 40, max: 49, color: "var(--chart-5)" },
      { name: "50–59", min: 50, max: 59, color: "var(--chart-3)" },
      { name: "60–69", min: 60, max: 69, color: "var(--chart-3)" },
      { name: "70–79", min: 70, max: 79, color: "var(--chart-1)" },
      { name: "80+", min: 80, max: 100, color: "var(--chart-1)" },
    ].map((b) => ({ name: b.name, color: b.color, value: items.filter((o) => o.result.score >= b.min && o.result.score <= b.max).length }));

    return {
      day: opp.day,
      oppCount: items.length,
      strong: items.filter((o) => o.result.level === "forte").length,
      topOpps: items.filter((o) => o.listings <= 5).sort((a, b) => b.result.score - a.result.score).slice(0, 6),
      categories: [...perCat.values()].sort((a, b) => b.forte + b.boa - (a.forte + a.boa)).slice(0, 8),
      scoreBuckets: buckets,
      status: [
        { name: "Em pesquisa", value: byStatus.pesquisa?.length ?? 0, color: "var(--chart-2)" },
        { name: "Aprovados", value: byStatus.aprovado?.length ?? 0, color: "var(--chart-3)" },
        { name: "Ativos", value: byStatus.ativo?.length ?? 0, color: "var(--chart-1)" },
        { name: "Descontinuados", value: byStatus.descontinuado?.length ?? 0, color: "var(--chart-5)" },
      ],
      productsTotal: productRows.length,
      suppliers: s?.n ?? 0,
      stockValue,
      stockUnits,
      lowStock: lowStock.sort((a, b) => a.days - b.days),
      fx: [...fxByDay.values()],
      lastFx: fx.length ? { usd: [...fx].reverse().find((r) => r.pair === "USD-BRL")?.rate, cny: [...fx].reverse().find((r) => r.pair === "CNY-BRL")?.rate } : null,
      runs,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

const greeting = () => {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
};

export default async function Dashboard() {
  const d = await loadDashboard();
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{greeting()}!</h1>
          <p className="muted mt-1 text-sm first-letter:uppercase">{today}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/oportunidades" className="btn">
            <Sparkles className="h-4 w-4" aria-hidden /> Ver oportunidades
          </Link>
          <Link href="/calculadora" className="btn-secondary">
            <Calculator className="h-4 w-4" aria-hidden /> Calculadora
          </Link>
          <Link href="/pesquisa" className="btn-secondary">
            <Search className="h-4 w-4" aria-hidden /> Pesquisar
          </Link>
        </div>
      </div>

      {!d ? (
        <div className="card text-sm">
          <p className="font-medium">Banco ainda não configurado.</p>
          <p className="muted mt-1">
            Preencha <code>DATABASE_URL</code> no <code>.env</code> (ou <code>.env.local</code>) e rode <code>npm run db:setup</code>.
          </p>
        </div>
      ) : "error" in d ? (
        <div className="card text-sm text-red-600 dark:text-red-400">Erro ao conectar no banco: {d.error}</div>
      ) : (
        <>
          <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard
              label="Oportunidades fortes"
              value={num(d.strong)}
              hint={d.day ? `de ${num(d.oppCount)} produtos no ranking` : "aguardando a primeira coleta"}
              icon={Sparkles}
              href="/oportunidades"
            />
            <StatCard label="Capital em estoque" value={brl(d.stockValue)} hint={`${num(d.stockUnits)} unidades`} icon={Wallet} tone="blue" href="/estoque" />
            <StatCard
              label="Produtos"
              value={num(d.productsTotal)}
              hint={`${num(d.suppliers)} fornecedores cadastrados`}
              icon={Package}
              tone="slate"
              href="/produtos"
            />
            <StatCard
              label="Dólar hoje"
              value={d.lastFx?.usd ? `R$ ${d.lastFx.usd.toLocaleString("pt-BR", { minimumFractionDigits: 4 })}` : "-"}
              hint={d.lastFx?.cny ? `Yuan R$ ${d.lastFx.cny.toLocaleString("pt-BR", { minimumFractionDigits: 4 })}` : "sem cotação coletada"}
              icon={DollarSign}
              tone="amber"
            />
          </section>

          <div className="grid gap-6 xl:grid-cols-3">
            <section className="card xl:col-span-2">
              <CardTitle
                subtitle={d.day ? `Ranking de ${d.day.split("-").reverse().join("/")} · até 5 anúncios` : undefined}
                action={
                  <Link href="/oportunidades" className="btn-ghost text-sm">
                    Ver todas <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                }
              >
                Melhores oportunidades
              </CardTitle>
              {d.topOpps.length === 0 ? (
                <EmptyState icon={Sparkles}>Sem oportunidades ainda. Rode a coleta collect-opportunities.</EmptyState>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {d.topOpps.map((o) => (
                    <li key={o.id}>
                      <Link href={`/oportunidades/${o.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-[var(--surface-2)]">
                        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-inset ring-slate-200 dark:ring-slate-700">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {o.pictureUrl && <img src={o.pictureUrl} alt="" className="h-full w-full object-contain" loading="lazy" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-1 text-sm font-medium">{o.name}</span>
                          <span className="muted line-clamp-1 text-xs">
                            #{o.position} · {o.listings} {o.listings === 1 ? "anúncio" : "anúncios"} · {brl(o.priceMedian ?? o.priceMin)}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block text-lg font-semibold tabular-nums">{o.result.score}</span>
                          <Badge tone={o.result.level === "forte" ? "green" : "amber"}>{o.result.level}</Badge>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card">
              <CardTitle subtitle="Distribuição dos scores de hoje">Qualidade das oportunidades</CardTitle>
              {d.oppCount === 0 ? (
                <EmptyState>Sem dados de ranking ainda.</EmptyState>
              ) : (
                <>
                  <Histogram data={d.scoreBuckets} label="Quantidade de produtos por faixa de score de oportunidade" />
                  <p className="muted mt-2 text-xs">Verde: forte (70+) · laranja: boa (50–69) · cinza: fraca</p>
                </>
              )}
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <section className="card xl:col-span-2">
              <CardTitle subtitle="Oportunidades fortes e boas por categoria principal">Onde estão as oportunidades</CardTitle>
              {d.categories.length === 0 ? (
                <EmptyState>Sem dados de ranking ainda.</EmptyState>
              ) : (
                <CategoryBars
                  data={d.categories}
                  series={[
                    { key: "forte", name: "Fortes", color: "var(--chart-1)" },
                    { key: "boa", name: "Boas", color: "var(--chart-3)" },
                  ]}
                  label="Oportunidades fortes e boas por categoria"
                />
              )}
            </section>
            <section className="card">
              <CardTitle subtitle="Seu funil de produtos">Produtos por status</CardTitle>
              <Donut data={d.status} centerLabel="produtos" label="Produtos por status: pesquisa, aprovados, ativos e descontinuados" />
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <section className="card xl:col-span-2">
              <CardTitle subtitle="Afeta o custo de produtos importados">Câmbio nos últimos 45 dias</CardTitle>
              {d.fx.length < 2 ? (
                <EmptyState>O gráfico aparece a partir do segundo dia de cotação.</EmptyState>
              ) : (
                <TrendLines
                  data={d.fx}
                  label="Cotação do dólar e do yuan em reais nos últimos 45 dias"
                  format={(v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  series={[
                    { key: "usd", name: "Dólar (R$)", color: "var(--chart-2)", axis: "left" },
                    { key: "cny", name: "Yuan (R$)", color: "var(--chart-3)", axis: "right" },
                  ]}
                />
              )}
            </section>

            <div className="space-y-6">
              <section className="card">
                <CardTitle
                  subtitle="Cobertura abaixo de 15 dias"
                  action={
                    d.lowStock.length > 0 ? (
                      <Badge tone="red">
                        <AlertTriangle className="h-3 w-3" aria-hidden /> {d.lowStock.length}
                      </Badge>
                    ) : undefined
                  }
                >
                  Repor estoque
                </CardTitle>
                {d.lowStock.length === 0 ? (
                  <EmptyState icon={Boxes}>Nenhum produto precisando de reposição.</EmptyState>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {d.lowStock.slice(0, 5).map((l) => (
                      <li key={l.id} className="flex items-center gap-2">
                        <Link href={`/produtos/${l.id}`} className="line-clamp-1 flex-1 hover:underline">
                          {l.name}
                        </Link>
                        <span className="muted tabular-nums">{num(l.balance)} un.</span>
                        <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{Math.round(l.days)}d</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card">
                <CardTitle subtitle="Coletas automáticas">Últimos jobs</CardTitle>
                {d.runs.length === 0 ? (
                  <EmptyState icon={Clock}>Nenhum job executado ainda.</EmptyState>
                ) : (
                  <table className="table-rows -mx-3 w-[calc(100%+1.5rem)] text-sm">
                    <thead className="sr-only">
                      <tr>
                        <Th>Job</Th>
                        <Th>Status</Th>
                        <Th right>Quando</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.runs.map((r) => (
                        <tr key={r.id}>
                          <Td>
                            <span className="flex items-center gap-2">
                              {r.status === "success" ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-label="sucesso" />
                              ) : r.status === "error" ? (
                                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" aria-label="erro" />
                              ) : (
                                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-label="em andamento" />
                              )}
                              {r.job}
                            </span>
                          </Td>
                          <Td right className="muted text-xs">
                            {r.startedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
