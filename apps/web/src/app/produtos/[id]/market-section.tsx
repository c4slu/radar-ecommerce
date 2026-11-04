import { and, asc, desc, eq, gte } from "drizzle-orm";
import { getDb, marketListings, marketSnapshots } from "@radar/db";
import { ActionForm } from "@/components/action-form";
import { Badge, EmptyState, Td, Th } from "@/components/ui";
import { brl, num, pct } from "@/lib/format";
import { collectNow } from "../actions";
import { PriceChart } from "./price-chart";

/** Histórico de preços e concorrentes do Mercado Livre para um produto. */
export async function MarketSection({ productId, cost, hasTerms }: { productId: string; cost: number | null; hasTerms: boolean }) {
  const db = getDb();
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const [snapshots, [last]] = await Promise.all([
    db
      .select()
      .from(marketSnapshots)
      .where(and(eq(marketSnapshots.productId, productId), eq(marketSnapshots.marketplace, "mercadolivre"), gte(marketSnapshots.day, since)))
      .orderBy(asc(marketSnapshots.day)),
    db
      .select({ at: marketListings.collectedAt })
      .from(marketListings)
      .where(eq(marketListings.productId, productId))
      .orderBy(desc(marketListings.collectedAt))
      .limit(1),
  ]);
  // anúncios da última coleta (mesma execução = mesmo minuto)
  const listings = last
    ? await db
        .select()
        .from(marketListings)
        .where(and(eq(marketListings.productId, productId), gte(marketListings.collectedAt, new Date(last.at.getTime() - 5 * 60_000))))
        .orderBy(asc(marketListings.price))
        .limit(15)
    : [];
  const latest = snapshots.at(-1);

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Mercado Livre</h2>
          <p className="text-xs text-zinc-500">
            {last
              ? `Última coleta: ${last.at.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Coleta automática a cada 6 horas.`
              : "Ainda sem coleta. Coleta automática a cada 6 horas para produtos em pesquisa, aprovados ou ativos."}
          </p>
        </div>
        <ActionForm action={collectNow.bind(null, productId)} submitLabel="Coletar agora" className="flex items-center gap-3">
          {null}
        </ActionForm>
      </div>
      {!hasTerms && <p className="text-xs text-amber-600">Sem termos de busca: o coletor usa o nome do produto. Para resultados melhores, cadastre termos abaixo.</p>}

      {latest && (
        <div className="grid gap-3 text-sm sm:grid-cols-5">
          <Mini label="Mediana hoje" value={brl(latest.priceMedian)} />
          <Mini label="Faixa" value={`${brl(latest.priceMin)} a ${brl(latest.priceMax)}`} />
          <Mini label="Anúncios" value={num(latest.listingsCount)} />
          <Mini label="Vendedores" value={num(latest.sellersCount)} />
          <Mini label="Oficial / Full" value={pct(latest.officialShare, 0)} />
        </div>
      )}

      {snapshots.length >= 2 ? (
        <PriceChart
          cost={cost}
          data={snapshots.map((s) => ({ day: s.day, min: s.priceMin, median: s.priceMedian, max: s.priceMax, sellers: s.sellersCount }))}
        />
      ) : (
        snapshots.length === 1 && <p className="text-xs text-zinc-500">O gráfico aparece a partir do segundo dia de coleta.</p>
      )}

      {listings.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Concorrente (mais baratos)</Th>
                <Th right>Preço</Th>
                <Th right>Vendidos</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <Td>
                    {l.url ? (
                      <a href={l.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {l.title}
                      </a>
                    ) : (
                      l.title
                    )}
                  </Td>
                  <Td right className={cost != null && l.price < cost ? "text-red-600" : ""}>
                    {brl(l.price)}
                  </Td>
                  <Td right>{num(l.soldQuantity)}</Td>
                  <Td>
                    <div className="flex gap-1">
                      {l.isOfficialStore && <Badge tone="blue">oficial</Badge>}
                      {l.isFulfillment && <Badge tone="green">full</Badge>}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !last && <EmptyState>Clique em Coletar agora para buscar os concorrentes.</EmptyState>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
