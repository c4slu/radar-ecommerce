import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { getDb, mlBestsellerRanks, mlCatalogProducts, mlCategories, mlOfferSnapshots } from "@radar/db";
import { SubmitButton } from "@/components/action-form";
import { Badge, EmptyState, PageHeader, Td, Th } from "@/components/ui";
import { brl, dateBr, num, pct } from "@/lib/format";
import { loadOpportunities } from "@/lib/opportunities";
import { trackOpportunity } from "../actions";
import { CompetitionChart, RankChart } from "./charts";

export const dynamic = "force-dynamic";

const LISTING_TYPE = { gold_special: "Clássico", gold_pro: "Premium" } as Record<string, string>;
const LEVEL_TONE = { forte: "green", boa: "amber", fraca: "zinc" } as const;

type StoredOffer = { s: string | null; p: number; t: string; f: boolean; o: boolean };

export default async function OpportunityDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [product] = await db.select().from(mlCatalogProducts).where(eq(mlCatalogProducts.id, id));
  if (!product) notFound();
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10);
  const [ranks, snaps, { items }] = await Promise.all([
    db
      .select()
      .from(mlBestsellerRanks)
      .where(and(eq(mlBestsellerRanks.productId, id), gte(mlBestsellerRanks.day, since)))
      .orderBy(asc(mlBestsellerRanks.day)),
    db
      .select()
      .from(mlOfferSnapshots)
      .where(and(eq(mlOfferSnapshots.productId, id), gte(mlOfferSnapshots.day, since)))
      .orderBy(asc(mlOfferSnapshots.day)),
    loadOpportunities(),
  ]);
  const opp = items.find((o) => o.id === id);
  const catIds = [...new Set(ranks.map((r) => r.categoryId))];
  const cats = catIds.length ? await db.select().from(mlCategories).where(inArray(mlCategories.id, catIds)) : [];
  const catName = new Map(cats.map((c) => [c.id, c.path]));

  // uma série por categoria (no máximo 5), uma linha por dia
  const series = catIds.slice(0, 5).map((c) => ({ key: c, name: catName.get(c)?.split(" > ").at(-1) ?? c }));
  const byDay = new Map<string, Record<string, string | number | null>>();
  for (const r of ranks) {
    const row = byDay.get(r.day) ?? { day: r.day };
    row[r.categoryId] = r.position;
    byDay.set(r.day, row);
  }
  const rankData = [...byDay.values()];
  const latest = snaps.at(-1);
  const offers = ((latest?.offers ?? []) as StoredOffer[]).slice().sort((a, b) => a.p - b.p);

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        subtitle={`${catName.get(product.categoryId ?? "") ?? catName.get(catIds[0] ?? "") ?? product.categoryId ?? ""} · no ranking desde ${dateBr(product.firstSeen)}`}
        action={
          <div className="flex items-center gap-2">
            <Link href={`/calculadora?produto=${id}`} className="btn">
              Calcular lucro
            </Link>
            <form action={trackOpportunity.bind(null, id)}>
              <SubmitButton label="Acompanhar" variant="secondary" />
            </form>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <div className="card flex items-center justify-center bg-white p-2">
          {product.pictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.pictureUrl} alt="" className="max-h-52 object-contain" />
          ) : (
            <span className="text-xs text-zinc-400">sem foto</span>
          )}
        </div>
        <div className="space-y-4">
          {opp && (
            <div className="card flex flex-wrap items-center gap-6">
              <div>
                <div className="text-xs text-zinc-500">Score de oportunidade</div>
                <div className="flex items-center gap-2">
                  <span className="text-4xl font-bold">{opp.result.score}</span>
                  <Badge tone={LEVEL_TONE[opp.result.level]}>{opp.result.level}</Badge>
                </div>
              </div>
              <Part label="Demanda" v={opp.result.parts.demand} />
              <Part label="Concorrência" v={opp.result.parts.competition} />
              <Part label="Preço" v={opp.result.parts.price} />
              <Part label="Novidade" v={opp.result.parts.novelty} />
              <div className="flex w-full flex-wrap gap-1">
                {opp.result.badges.map((b) => (
                  <Badge key={b.text} tone={b.tone}>
                    {b.text}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {latest && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Mini label="Anúncios" value={num(latest.listingsCount)} />
              <Mini label="Vendedores lidos" value={num(latest.sellersCount)} />
              <Mini label="Menor preço" value={brl(latest.priceMin)} />
              <Mini label="Mediana" value={brl(latest.priceMedian)} />
              <Mini label="Premium" value={pct(latest.premiumShare, 0)} />
            </div>
          )}
          {product.permalink && (
            <a href={product.permalink} target="_blank" rel="noreferrer" className="text-sm text-sky-600 hover:underline">
              Abrir no Mercado Livre
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 font-medium">Posição nos mais vendidos</h2>
          {rankData.length >= 2 ? <RankChart data={rankData} series={series} /> : <EmptyState>O histórico aparece a partir do 2º dia de coleta.</EmptyState>}
        </div>
        <div className="card">
          <h2 className="mb-2 font-medium">Concorrência e preço</h2>
          {snaps.length >= 2 ? (
            <CompetitionChart data={snaps.map((s) => ({ day: s.day, listings: s.listingsCount, median: s.priceMedian }))} />
          ) : (
            <EmptyState>O histórico aparece a partir do 2º dia de coleta.</EmptyState>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-3 font-medium">Anúncios atuais {latest && <span className="text-xs font-normal text-zinc-500">({dateBr(latest.day)})</span>}</h2>
        {offers.length === 0 ? (
          <EmptyState>Sem anúncios lidos.</EmptyState>
        ) : (
          <table className="table-rows w-full text-sm">
            <thead>
              <tr>
                <Th>Vendedor</Th>
                <Th right>Preço</Th>
                <Th>Tipo</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {offers.map((o, i) => (
                <tr key={`${o.s}-${i}`} className="border-t border-[var(--border)]">
                  <Td className="font-mono text-xs text-zinc-500">{o.s ?? "-"}</Td>
                  <Td right>{brl(o.p)}</Td>
                  <Td>{LISTING_TYPE[o.t] ?? o.t}</Td>
                  <Td>
                    <div className="flex gap-1">
                      {o.f && <Badge tone="green">full</Badge>}
                      {o.o && <Badge tone="blue">oficial</Badge>}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-zinc-400">O ML não libera nome nem vendas de cada vendedor para esta aplicação; aparece o ID.</p>
      </div>
    </div>
  );
}

function Part({ label, v }: { label: string; v: number }) {
  return (
    <div className="min-w-24">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 h-1.5 w-24 rounded bg-zinc-100 dark:bg-zinc-800">
        <div className={`h-1.5 rounded ${v >= 70 ? "bg-emerald-500" : v >= 45 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${v}%` }} />
      </div>
      <div className="text-xs font-medium">{v}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
