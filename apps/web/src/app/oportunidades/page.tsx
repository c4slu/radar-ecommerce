import { Sparkles } from "lucide-react";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { parseLocaleNumber } from "@radar/core";
import { getDb, jobRuns, trendSignals } from "@radar/db";
import { SubmitButton } from "@/components/action-form";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/data";
import { brl, dateBr, num, pct } from "@/lib/format";
import { applyFilters, categoryTree, loadOpportunities, type Opportunity, type OpportunityFilters } from "@/lib/opportunities";
import { trackOpportunity } from "./actions";
import { Sparkline } from "./sparkline";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

const LEVEL_TONE = { forte: "green", boa: "amber", fraca: "zinc" } as const;

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  // tabelas de oportunidades ainda não criadas neste banco: mostra a instrução em vez de erro
  const missingTables = (err: unknown) => {
    const m = String((err as { cause?: { message?: string } }).cause?.message ?? (err as Error).message);
    if (/does not exist|não existe/i.test(m)) return true;
    throw err;
  };
  let setupNeeded = false;
  const [{ day, items }, tree, settings, lastRun] = await Promise.all([
    loadOpportunities().catch((e) => (missingTables(e), (setupNeeded = true), { day: null, items: [] })),
    categoryTree().catch((e) => (missingTables(e), { cats: [], byId: new Map(), rootOf: (id: string) => id })),
    getSettings(),
    getDb()
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.job, "collect-opportunities"))
      .orderBy(desc(jobRuns.startedAt))
      .limit(1),
  ]);

  // sem parâmetros na URL valem os critérios salvos em Configurações
  const touched = Object.keys(sp).length > 0;
  const filters: OpportunityFilters = {
    category: sp.cat || undefined,
    maxListings: sp.max != null ? (sp.max === "" ? undefined : parseLocaleNumber(sp.max)) : settings.oppMaxListings,
    priceMin: sp.pmin != null ? (sp.pmin === "" ? undefined : parseLocaleNumber(sp.pmin)) : settings.oppPriceMin,
    priceMax: sp.pmax != null ? (sp.pmax === "" ? undefined : parseLocaleNumber(sp.pmax)) : settings.oppPriceMax,
    noFull: sp.nofull === "1",
    onlyNew: sp.novos === "1",
    sort: (["score", "position", "listings", "price"] as const).find((s) => s === sp.ordem) ?? "score",
  };
  const filtered = applyFilters(items, filters, tree.rootOf);
  const shown = filtered.slice(0, 60);
  const strong = items.filter((o) => o.result.level === "forte").length;
  const roots = tree.cats.filter((c) => c.level === 1 && c.enabled).sort((a, b) => a.name.localeCompare(b.name));

  // categorias raiz com mais oportunidades fortes
  const hot = new Map<string, { name: string; strong: number; total: number }>();
  for (const o of items) {
    const root = tree.rootOf(o.categoryId);
    const h = hot.get(root) ?? { name: tree.byId.get(root)?.name ?? root, strong: 0, total: 0 };
    h.total++;
    if (o.result.level === "forte") h.strong++;
    hot.set(root, h);
  }
  const hotList = [...hot.entries()].sort((a, b) => b[1].strong - a[1].strong).slice(0, 8);
  const trends = day ? await latestTrends() : [];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Sparkles} title="Oportunidades"
        subtitle="Produtos entre os mais vendidos do Mercado Livre com poucos anúncios concorrentes."
      />

      {setupNeeded ? (
        <div className="card text-sm">
          <p className="font-medium">As tabelas de oportunidades ainda não existem neste banco.</p>
          <p className="mt-1 text-zinc-500">
            Rode <code>npm run db:setup</code> (cria tabelas e funções no banco do .env.local, ou do .env se não houver).
          </p>
        </div>
      ) : !day ? (
        <div className="card text-sm">
          <p className="font-medium">Ainda não há dados coletados.</p>
          <p className="mt-1 text-zinc-500">
            Rode <code>npm run collect:opportunities -- --sync</code> (árvore de categorias) e depois <code>npm run collect:opportunities</code>, ou
            dispare o workflow <code>collect-opportunities</code> no GitHub. O Mercado Livre precisa estar conectado em{" "}
            <Link href="/configuracoes" className="underline">
              Configurações
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Produtos analisados" value={num(items.length)} hint={`ranking de ${dateBr(day)}`} />
            <Kpi label="Oportunidades fortes" value={num(strong)} hint="score 70 ou mais" />
            <Kpi label="Nos seus critérios" value={num(filtered.length)} hint={touched ? "filtros atuais" : "até " + settings.oppMaxListings + " anúncios, " + brl(settings.oppPriceMin, 0) + "–" + brl(settings.oppPriceMax, 0)} />
            <Kpi
              label="Última coleta"
              value={lastRun[0] ? lastRun[0].startedAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "-"}
              hint={
                lastRun[0]?.status === "error"
                  ? "terminou com erro"
                  : lastRun[0]?.status === "running"
                    ? "em andamento"
                    : lastRun[0]
                      ? `${num(lastRun[0].itemsProcessed)} produtos`
                      : ""
              }
            />
          </div>

          <form className="card grid gap-3 sm:grid-cols-3 lg:grid-cols-[1.4fr_repeat(3,1fr)_auto_auto_1fr_auto] lg:items-end">
            <label className="block">
              <span className="label">Categoria</span>
              <select name="cat" defaultValue={filters.category ?? ""} className="input">
                <option value="">Todas</option>
                {roots.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Máx. anúncios</span>
              <input name="max" defaultValue={filters.maxListings ?? ""} className="input" inputMode="numeric" />
            </label>
            <label className="block">
              <span className="label">Preço de (R$)</span>
              <input name="pmin" defaultValue={filters.priceMin ?? ""} className="input" inputMode="decimal" />
            </label>
            <label className="block">
              <span className="label">até (R$)</span>
              <input name="pmax" defaultValue={filters.priceMax ?? ""} className="input" inputMode="decimal" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="nofull" value="1" defaultChecked={filters.noFull} /> Sem Full
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="novos" value="1" defaultChecked={filters.onlyNew} /> Só novos
            </label>
            <label className="block">
              <span className="label">Ordenar por</span>
              <select name="ordem" defaultValue={filters.sort} className="input">
                <option value="score">Melhor score</option>
                <option value="position">Posição no ranking</option>
                <option value="listings">Menos anúncios</option>
                <option value="price">Menor preço</option>
              </select>
            </label>
            <div className="flex gap-2">
              <button className="btn">Filtrar</button>
              <Link href="/oportunidades?max=&pmin=&pmax=" className="rounded-md px-3 py-2 text-sm text-zinc-500 hover:underline">
                Ver tudo
              </Link>
            </div>
          </form>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0">
              {shown.length === 0 ? (
                <div className="card">
                  <EmptyState>Nenhum produto com esses filtros. Experimente aumentar o máximo de anúncios ou a faixa de preço.</EmptyState>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {shown.map((o) => (
                    <OpportunityCard key={o.id} o={o} />
                  ))}
                </div>
              )}
              {filtered.length > shown.length && (
                <p className="mt-3 text-center text-xs text-zinc-500">
                  Mostrando os {shown.length} melhores de {filtered.length}. Refine os filtros para ver outros.
                </p>
              )}
            </div>

            <aside className="space-y-4">
              <div className="card">
                <h2 className="mb-3 text-sm font-medium">Categorias mais quentes</h2>
                <ul className="space-y-2 text-sm">
                  {hotList.map(([id, h]) => (
                    <li key={id} className="flex items-center justify-between gap-2">
                      <Link href={`/oportunidades?cat=${id}`} className="truncate hover:underline">
                        {h.name}
                      </Link>
                      <span className="shrink-0 text-xs text-zinc-500">
                        <span className="font-semibold text-emerald-600">{h.strong}</span> / {h.total}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-zinc-400">fortes / produtos no ranking</p>
              </div>
              <div className="card">
                <h2 className="mb-3 text-sm font-medium">Buscas em alta no ML</h2>
                {trends.length === 0 ? (
                  <p className="text-xs text-zinc-500">Sem tendências coletadas ainda.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {trends.map((t) => (
                      <span key={t.term} className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs dark:border-zinc-700">
                        {t.term}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function OpportunityCard({ o }: { o: Opportunity }) {
  const r = o.result;
  return (
    <div className="card card-hover flex flex-col gap-3 p-4">
      <div className="flex gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-white">
          {o.pictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={o.pictureUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/oportunidades/${o.id}`} className="line-clamp-2 text-sm font-medium hover:underline">
            {o.name}
          </Link>
          <p className="mt-0.5 truncate text-xs text-zinc-500">{o.categoryPath}</p>
        </div>
        <div className="shrink-0 text-center">
          <div className="text-2xl font-bold leading-none">{r.score}</div>
          <Badge tone={LEVEL_TONE[r.level]}>{r.level}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <Stat label="Posição" value={`#${o.position}`} />
        <Stat label="Anúncios" value={num(o.listings)} strong={o.listings <= 5} />
        <Stat label="Preço" value={o.priceMin != null && o.priceMax != null && o.priceMin !== o.priceMax ? `${brl(o.priceMin, 0)}–${brl(o.priceMax, 0)}` : brl(o.priceMin)} />
        <Stat label="Full" value={pct(o.fullShare, 0)} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {r.badges.slice(0, 4).map((b) => (
            <Badge key={b.text} tone={b.tone}>
              {b.text}
            </Badge>
          ))}
        </div>
        <Sparkline points={o.positions} />
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <Link href={`/calculadora?produto=${o.id}`} className="btn">
          Calcular
        </Link>
        <form action={trackOpportunity.bind(null, o.id)}>
          <SubmitButton label="Acompanhar" variant="secondary" />
        </form>
        {o.permalink && (
          <a href={o.permalink} target="_blank" rel="noreferrer" className="ml-auto text-xs text-zinc-500 hover:underline">
            Ver no ML
          </a>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className={`font-medium ${strong ? "text-emerald-600" : ""}`}>{value}</div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-zinc-400">{hint}</div>}
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
    .select({ term: trendSignals.term })
    .from(trendSignals)
    .where(and(eq(trendSignals.source, "ml_trends"), eq(trendSignals.day, last.day)))
    .orderBy(trendSignals.value)
    .limit(25);
}
