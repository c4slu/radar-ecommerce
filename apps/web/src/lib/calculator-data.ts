import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, mlFeeCache } from "@radar/db";
import { getCatalogProduct, getListingFees, getProductOffers } from "@radar/ml";

export interface CalcProduct {
  id: string;
  name: string;
  pictureUrl: string | null;
  permalink: string;
  /** dias desde a criação do produto no catálogo */
  ageDays: number | null;
  categoryId: string | null;
  brand: string | null;
  model: string | null;
  listings: number;
  prices: number[];
  priceMin: number | null;
  priceMedian: number | null;
  fullShare: number;
  officialShare: number;
}

export interface CalcFees {
  classico: { pct: number; fixed: number };
  premium: { pct: number; fixed: number };
  /** de onde veio a tarifa */
  source: "ml" | "padrao";
}

export const DEFAULT_FEES: CalcFees = { classico: { pct: 0.115, fixed: 0 }, premium: { pct: 0.165, fixed: 0 }, source: "padrao" };

/** Extrai o ID de catálogo (MLB123…) de um ID ou link do ML (…/p/MLB123…). */
export function parseCatalogId(input: string): string | null {
  const m = input.toUpperCase().match(/MLB-?(\d{5,})/);
  return m ? `MLB${m[1]}` : null;
}

export async function loadCalcProduct(id: string): Promise<CalcProduct> {
  const [p, o] = await Promise.all([getCatalogProduct(id), getProductOffers(id)]);
  const prices = o.offers.map((x) => x.price).sort((a, b) => a - b);
  const n = prices.length;
  return {
    id: p.id,
    name: p.name,
    pictureUrl: p.pictureUrl,
    permalink: p.permalink,
    ageDays: p.createdAt ? Math.floor((Date.now() - p.createdAt.getTime()) / 86_400_000) : null,
    categoryId: o.offers.find((x) => x.categoryId)?.categoryId ?? null,
    brand: p.brand,
    model: p.model,
    listings: o.total,
    prices,
    priceMin: n ? prices[0]! : null,
    priceMedian: n ? (n % 2 ? prices[(n - 1) / 2]! : (prices[n / 2 - 1]! + prices[n / 2]!) / 2) : null,
    fullShare: n ? o.offers.filter((x) => x.isFull).length / n : 0,
    officialShare: n ? o.offers.filter((x) => x.isOfficial).length / n : 0,
  };
}

const CACHE_DAYS = 7;
/** A tarifa muda por faixa de preço: abaixo de R$ 100 guarda por real, acima de 10 em 10. */
const bucket = (price: number) => (price < 100 ? Math.floor(price) : Math.floor(price / 10) * 10);

/** Tarifas oficiais do ML (Clássico/Premium) para o preço e categoria, com cache de 7 dias no banco. */
export async function loadFees(price: number, categoryId: string | null): Promise<CalcFees> {
  if (!categoryId || !(price > 0)) return DEFAULT_FEES;
  const db = getDb();
  const b = bucket(price);
  const since = new Date(Date.now() - CACHE_DAYS * 86_400_000);
  const pick = (rows: { listingTypeId: string; percentageFee: number; fixedFee: number }[]): CalcFees | null => {
    const c = rows.find((r) => r.listingTypeId === "gold_special");
    const p = rows.find((r) => r.listingTypeId === "gold_pro");
    return c && p ? { classico: { pct: c.percentageFee / 100, fixed: c.fixedFee }, premium: { pct: p.percentageFee / 100, fixed: p.fixedFee }, source: "ml" } : null;
  };
  try {
    const cached = await db
      .select()
      .from(mlFeeCache)
      .where(and(eq(mlFeeCache.categoryId, categoryId), eq(mlFeeCache.priceBucket, b), gte(mlFeeCache.fetchedAt, since)));
    const hit = pick(cached);
    if (hit) return hit;
  } catch {
    // tabela ainda não criada neste banco: segue sem cache
  }
  try {
    const fees = await getListingFees(price, categoryId);
    const rows = fees.map((f) => ({
      categoryId,
      priceBucket: b,
      listingTypeId: f.listingTypeId,
      listingTypeName: f.name,
      percentageFee: f.percentageFee,
      fixedFee: f.fixedFee,
      fetchedAt: new Date(),
    }));
    await db
      .insert(mlFeeCache)
      .values(rows)
      .onConflictDoUpdate({
        target: [mlFeeCache.categoryId, mlFeeCache.priceBucket, mlFeeCache.listingTypeId],
        set: { percentageFee: sql`excluded.percentage_fee`, fixedFee: sql`excluded.fixed_fee`, fetchedAt: sql`excluded.fetched_at` },
      })
      .catch(() => null);
    return pick(rows) ?? DEFAULT_FEES;
  } catch {
    return DEFAULT_FEES;
  }
}
