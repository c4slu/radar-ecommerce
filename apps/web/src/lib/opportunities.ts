import "server-only";
import { sql } from "drizzle-orm";
import { computeOpportunity, DEFAULT_OPPORTUNITY_PREFS, type OpportunityResult } from "@radar/core";
import { getDb, mlCategories } from "@radar/db";
import { getSettings } from "./data";

export interface Opportunity {
  id: string;
  name: string;
  pictureUrl: string | null;
  permalink: string | null;
  categoryId: string;
  categoryPath: string;
  categoryIds: string[];
  position: number;
  positions: { day: number; position: number }[];
  listings: number;
  sellers: number;
  priceMin: number | null;
  priceMedian: number | null;
  priceMax: number | null;
  fullShare: number;
  officialShare: number;
  catalogAgeDays: number | null;
  result: OpportunityResult;
}

export interface OpportunityFilters {
  category?: string;
  maxListings?: number;
  priceMin?: number;
  priceMax?: number;
  noFull?: boolean;
  onlyNew?: boolean;
  sort?: "score" | "position" | "listings" | "price";
}

type Row = {
  product_id: string;
  pos: number;
  cats: string[];
  cat: string;
  h: { d: number; p: number }[] | null;
  days: number | null;
  listings_count: number;
  sellers_count: number;
  price_min: string | null;
  price_median: string | null;
  price_max: string | null;
  full_count: number;
  official_count: number;
  offers_read: number | null;
  week_listings: number | null;
  name: string;
  picture_url: string | null;
  permalink: string | null;
  catalog_age_days: number | null;
  first_seen_days: number | null;
  cat_path: string | null;
};

const num = (v: string | null) => (v == null ? null : Number(v));

/** Dia mais recente com ranking coletado (ou null se a coleta nunca rodou). */
export async function latestRankDay(): Promise<string | null> {
  const r = await getDb().execute<{ d: string | null }>(sql`select max(day)::text as d from ml_bestseller_ranks`);
  return r[0]?.d ?? null;
}

/**
 * Todas as oportunidades do último dia coletado, já com score. A agregação (posição do dia,
 * histórico de 14 dias, último retrato da concorrência) é feita no banco: uma linha por produto.
 */
export async function loadOpportunities(): Promise<{ day: string | null; items: Opportunity[] }> {
  const db = getDb();
  const day = await latestRankDay();
  if (!day) return { day: null, items: [] };
  const [rows, settings] = await Promise.all([
    db.execute<Row>(sql`
      with today as (
        select product_id, min(position) as pos,
               array_agg(distinct category_id) as cats,
               (array_agg(category_id order by position))[1] as cat
        from ml_bestseller_ranks
        where day = ${day}::date and type = 'PRODUCT'
        group by product_id
      ),
      daily as (
        select product_id, day, min(position) as pos
        from ml_bestseller_ranks
        where day > ${day}::date - 14 and product_id in (select product_id from today)
        group by product_id, day
      ),
      hist as (
        select product_id,
               json_agg(json_build_object('d', day - (${day}::date - 13), 'p', pos) order by day) as h,
               count(*)::int as days
        from daily group by product_id
      ),
      snap as (
        select distinct on (product_id) *
        from ml_offer_snapshots
        where product_id in (select product_id from today)
        order by product_id, day desc
      ),
      week as (
        select distinct on (product_id) product_id, listings_count
        from ml_offer_snapshots
        where day <= ${day}::date - 7 and product_id in (select product_id from today)
        order by product_id, day desc
      )
      select t.product_id, t.pos, t.cats, t.cat, h.h, h.days,
             s.listings_count, s.sellers_count, s.price_min, s.price_median, s.price_max,
             s.full_count, s.official_count, jsonb_array_length(s.offers) as offers_read,
             w.listings_count as week_listings,
             p.name, p.picture_url, p.permalink,
             (current_date - p.catalog_created_at::date) as catalog_age_days,
             (${day}::date - p.first_seen) as first_seen_days,
             c.path as cat_path
      from today t
      join snap s on s.product_id = t.product_id
      join ml_catalog_products p on p.id = t.product_id
      left join hist h on h.product_id = t.product_id
      left join week w on w.product_id = t.product_id
      left join ml_categories c on c.id = t.cat
    `),
    getSettings(),
  ]);
  const prefs = { ...DEFAULT_OPPORTUNITY_PREFS, priceMinPref: settings.oppPriceMin, priceMaxPref: settings.oppPriceMax };

  const items = rows.map((r): Opportunity => {
    const read = r.offers_read || 0;
    const positions = (r.h ?? []).map((x) => ({ day: x.d, position: x.p }));
    const fullShare = read ? r.full_count / read : 0;
    const officialShare = read ? r.official_count / read : 0;
    const base = {
      position: r.pos,
      listings: r.listings_count,
      priceMin: num(r.price_min),
      priceMedian: num(r.price_median),
      priceMax: num(r.price_max),
      fullShare,
      officialShare,
      catalogAgeDays: r.catalog_age_days,
    };
    return {
      id: r.product_id,
      name: r.name,
      pictureUrl: r.picture_url,
      permalink: r.permalink,
      categoryId: r.cat,
      categoryPath: r.cat_path ?? r.cat,
      categoryIds: r.cats,
      positions,
      sellers: r.sellers_count,
      ...base,
      result: computeOpportunity(
        {
          ...base,
          positionHistory: positions,
          daysInTop: r.days ?? 1,
          categoriesCount: r.cats.length,
          listingsWeekAgo: r.week_listings,
          firstSeenDaysAgo: r.first_seen_days,
        },
        prefs,
      ),
    };
  });
  return { day, items };
}

/** Mapa categoria -> categoria raiz (para filtrar por categoria de 1º nível). */
export async function categoryTree() {
  const cats = await getDb()
    .select({ id: mlCategories.id, name: mlCategories.name, parentId: mlCategories.parentId, level: mlCategories.level, enabled: mlCategories.enabled })
    .from(mlCategories);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const rootOf = (id: string) => {
    const c = byId.get(id);
    return c?.parentId ?? id;
  };
  return { cats, byId, rootOf };
}

export function applyFilters(items: Opportunity[], f: OpportunityFilters, rootOf: (id: string) => string) {
  let out = items.filter((o) => {
    if (f.category && !o.categoryIds.some((c) => c === f.category || rootOf(c) === f.category)) return false;
    if (f.maxListings != null && o.listings > f.maxListings) return false;
    const ticket = o.priceMedian ?? o.priceMin;
    if (f.priceMin != null && (ticket == null || ticket < f.priceMin)) return false;
    if (f.priceMax != null && (ticket == null || ticket > f.priceMax)) return false;
    if (f.noFull && o.fullShare > 0) return false;
    if (f.onlyNew && (o.catalogAgeDays == null || o.catalogAgeDays > 90)) return false;
    return true;
  });
  const sorters: Record<NonNullable<OpportunityFilters["sort"]>, (a: Opportunity, b: Opportunity) => number> = {
    score: (a, b) => b.result.score - a.result.score || a.position - b.position,
    position: (a, b) => a.position - b.position || b.result.score - a.result.score,
    listings: (a, b) => a.listings - b.listings || b.result.score - a.result.score,
    price: (a, b) => (a.priceMedian ?? Infinity) - (b.priceMedian ?? Infinity),
  };
  out = out.sort(sorters[f.sort ?? "score"]);
  return out;
}
