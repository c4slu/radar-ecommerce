import { and, asc, desc, eq, gte } from "drizzle-orm";
import { getDb, marketListings, marketSnapshots } from "@radar/db";
import { ActionForm } from "@/components/action-form";
import { Badge, EmptyState, Td, Th } from "@/components/ui";
import { brl, num, pct } from "@/lib/format";
import { MARKETPLACE_NAME } from "@/lib/market";
import { collectNow } from "../actions";
import { PriceChart } from "./price-chart";

type Mp = "mercadolivre" | "shopee";

/** Histórico de preços e concorrentes de um marketplace para um produto. */
export async function MarketSection({
  productId,
  marketplace,
  cost,
  hasTerms,
  showCollect,
  available,
}: {
  productId: string;
  marketplace: Mp;
  cost: number | null;
  hasTerms: boolean;
  showCollect: boolean;
  available: boolean;
}) {
  const isMl = marketplace === "mercadolivre";
  const db = getDb();
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const [snapshots, [last]] = await Promise.all([
    db
      .select()
      .from(marketSnapshots)
      .where(and(eq(marketSnapshots.productId, productId), eq(marketSnapshots.marketplace, marketplace), gte(marketSnapshots.day, since)))
      .orderBy(asc(marketSnapshots.day)),
    db
      .select({ at: marketListings.collectedAt })
      .from(marketListings)
      .where(and(eq(marketListings.productId, productId), eq(marketListings.marketplace, marketplace)))
      .orderBy(desc(marketListings.collectedAt))
      .limit(1),
  ]);
  // anúncios da última coleta (mesma execução = mesmo minuto)
  const listings = last
    ? await db
        .select()
        .from(marketListings)
        .where(
          and(
            eq(marketListings.productId, productId),
            eq(marketListings.marketplace, marketplace),
            gte(marketListings.collectedAt, new Date(last.at.getTime() - 5 * 60_000)),
          ),
        )
        .orderBy(asc(marketListings.price))
        .limit(15)
    : [];
  const latest = snapshots.at(-1);

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">{MARKETPLACE_NAME[marketplace]}</h2>
          <p className="text-xs text-zinc-500">
            {last
              ? `Última coleta: ${last.at.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Coleta automática a cada 6 horas.`
              : available
                ? "Ainda sem coleta. Coleta automática a cada 6 horas para produtos em pesquisa, aprovados ou ativos."
                : isMl
                  ? "Mercado Livre sem acesso à busca para esta aplicação (bloqueio do ML)."
                  : "Shopee não configurada: defina SHOPEE_APP_ID e SHOPEE_APP_SECRET."}
          </p>
        </div>
        {showCollect && (
          <ActionForm action={collectNow.bind(null, productId)} submitLabel="Coletar agora" className="flex items-center gap-3">
            {null}
          </ActionForm>
        )}
      </div>
      {showCollect && !hasTerms && <p className="text-xs text-amber-600">Sem termos de busca: o coletor usa o nome do produto. Para resultados melhores, cadastre termos abaixo.</p>}

      {latest && (
        <div className="grid gap-3 text-sm sm:grid-cols-5">
          <Mini label="Mediana hoje" value={brl(latest.priceMedian)} />
          <Mini label="Faixa" value={`${brl(latest.priceMin)} a ${brl(latest.priceMax)}`} />
          <Mini label="Anúncios" value={num(latest.listingsCount)} />
          <Mini label="Vendedores" value={num(latest.sellersCount)} />
          <Mini label={isMl ? "Oficial / Full" : "Mall / Indicado"} value={pct(latest.officialShare, 0)} />
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
          <table className="table-rows w-full text-sm">
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
                <tr key={l.id} className="border-t border-[var(--border)]">
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
                      {l.isOfficialStore && <Badge tone="blue">{isMl ? "oficial" : "mall"}</Badge>}
                      {l.isFulfillment && <Badge tone="green">{isMl ? "full" : "indicado"}</Badge>}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !last && available && <EmptyState>Clique em Coletar agora para buscar os concorrentes.</EmptyState>
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
