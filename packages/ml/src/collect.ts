import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, marketListings, products, trendSignals } from "@radar/db";
import { getTrends, searchListings, type MlListing } from "./api";
import { MlError } from "./auth";

export interface CollectResult {
  products: number;
  listings: number;
  source: Set<string>;
  errors: string[];
}

const ACTIVE_STATUSES = ["pesquisa", "aprovado", "ativo"] as const;
/** termos por produto e anúncios por termo: limita chamadas à API e espaço no banco */
const MAX_TERMS = 3;
const PER_TERM = 50;

/**
 * Busca concorrentes no ML para os produtos ativos (ou os indicados), grava em
 * market_listings e atualiza o agregado do dia em market_snapshots.
 */
export async function collectMarketListings(productIds?: string[]): Promise<CollectResult> {
  const db = getDb();
  const list = await db
    .select()
    .from(products)
    .where(
      and(
        inArray(products.status, [...ACTIVE_STATUSES]),
        productIds?.length ? inArray(products.id, productIds) : undefined,
      ),
    );

  const result: CollectResult = { products: 0, listings: 0, source: new Set(), errors: [] };
  for (const p of list) {
    const terms = (p.searchTerms.length ? p.searchTerms : [p.name]).slice(0, MAX_TERMS);
    const byId = new Map<string, MlListing>();
    try {
      for (const term of terms) {
        const r = await searchListings(term, PER_TERM);
        result.source.add(r.source);
        for (const l of r.listings) if (!byId.has(l.externalId)) byId.set(l.externalId, l);
      }
    } catch (err) {
      result.errors.push(`${p.sku}: ${(err as Error).message}`);
      // sem conexão/token não adianta seguir para os outros produtos
      if (err instanceof MlError && err.status === 401) break;
      continue;
    }
    const rows = [...byId.values()];
    if (rows.length) {
      await db.insert(marketListings).values(
        rows.map((l) => ({
          productId: p.id,
          marketplace: "mercadolivre" as const,
          externalId: l.externalId,
          title: l.title,
          price: l.price,
          soldQuantity: l.soldQuantity,
          sellerId: l.sellerId,
          sellerName: l.sellerName,
          isOfficialStore: l.isOfficialStore,
          isFulfillment: l.isFulfillment,
          url: l.url,
        })),
      );
      // preenche a categoria do ML com a mais frequente entre os concorrentes
      if (!p.mlCategoryId) {
        const counts = new Map<string, number>();
        for (const l of rows) if (l.categoryId) counts.set(l.categoryId, (counts.get(l.categoryId) ?? 0) + 1);
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (top) await db.update(products).set({ mlCategoryId: top }).where(eq(products.id, p.id));
      }
    }
    result.products++;
    result.listings += rows.length;
  }

  if (result.listings > 0) {
    await db.execute(sql`select public.aggregate_market_snapshots((now() at time zone 'America/Sao_Paulo')::date)`);
  }
  return result;
}

/**
 * Tendências de busca do ML (geral + categorias dos produtos acompanhados).
 * Grava em trend_signals com value = posição no ranking (1 = mais buscado).
 */
export async function collectTrends(): Promise<number> {
  const db = getDb();
  const cats = await db
    .selectDistinct({ c: products.mlCategoryId })
    .from(products)
    .where(inArray(products.status, [...ACTIVE_STATUSES]));
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const rows: (typeof trendSignals.$inferInsert)[] = [];
  for (const category of [undefined, ...cats.map((c) => c.c).filter((c): c is string => !!c)]) {
    try {
      const list = await getTrends(category);
      list.forEach((t, i) =>
        rows.push({ term: t.keyword.toLowerCase(), source: "ml_trends", value: i + 1, day, meta: { category: category ?? "geral" } }),
      );
    } catch (err) {
      if (err instanceof MlError && err.status === 404) continue;
      throw err;
    }
  }
  // o mesmo termo pode aparecer em mais de uma lista: fica a melhor posição
  const best = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!best.has(r.term) || Number(best.get(r.term)!.value) > Number(r.value)) best.set(r.term, r);
  if (best.size) {
    await db
      .insert(trendSignals)
      .values([...best.values()])
      .onConflictDoUpdate({
        target: [trendSignals.term, trendSignals.source, trendSignals.day],
        set: { value: sql`excluded.value`, meta: sql`excluded.meta` },
      });
  }
  return best.size;
}
