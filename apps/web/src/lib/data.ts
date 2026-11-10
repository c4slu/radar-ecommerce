import "server-only";
import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { fxRates, getDb, marketplaceFees, settings } from "@radar/db";
import { DEFAULT_WEIGHTS, type FeeRule, type RiskWeights } from "@radar/core";

export interface AppSettings {
  taxPct: number;
  targetMargin: number;
  expectedShare: number;
  coverageDays: number;
  maxDaysToSell: number;
  riskWeights: RiskWeights;
  /** critérios do dashboard de oportunidades */
  oppPriceMin: number;
  oppPriceMax: number;
  oppMaxListings: number;
}

const DEFAULTS: AppSettings = {
  taxPct: 0.06,
  targetMargin: 0.2,
  expectedShare: 0.05,
  coverageDays: 30,
  maxDaysToSell: 90,
  riskWeights: DEFAULT_WEIGHTS,
  oppPriceMin: 30,
  oppPriceMax: 300,
  oppMaxListings: 5,
};

const KEY_MAP: Record<string, keyof AppSettings> = {
  tax_pct: "taxPct",
  target_margin: "targetMargin",
  expected_share: "expectedShare",
  coverage_days: "coverageDays",
  max_days_to_sell: "maxDaysToSell",
  risk_weights: "riskWeights",
  opp_price_min: "oppPriceMin",
  opp_price_max: "oppPriceMax",
  opp_max_listings: "oppMaxListings",
};
export const SETTINGS_KEYS = Object.fromEntries(Object.entries(KEY_MAP).map(([k, v]) => [v, k])) as Record<
  keyof AppSettings,
  string
>;

export async function getSettings(): Promise<AppSettings> {
  const rows = await getDb().select().from(settings);
  const out: AppSettings = { ...DEFAULTS };
  for (const r of rows) {
    const key = KEY_MAP[r.key];
    if (key) (out as unknown as Record<string, unknown>)[key] = r.value;
  }
  return out;
}

/** Tarifas vigentes hoje, no formato usado pelo core. */
export async function getActiveFeeRules(): Promise<FeeRule[]> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await getDb()
    .select()
    .from(marketplaceFees)
    .where(and(lte(marketplaceFees.validFrom, today), or(isNull(marketplaceFees.validTo), gte(marketplaceFees.validTo, today))));
  return rows.map((r) => ({
    marketplace: r.marketplace,
    categoryId: r.categoryId,
    commissionPct: r.commissionPct,
    fixedFee: r.fixedFee,
    minPrice: r.minPrice,
    maxPrice: r.maxPrice,
  }));
}

/** Última cotação de cada moeda em R$ (ex.: { USD: 5.49, CNY: 0.82, BRL: 1 }). */
export async function getLatestFx(): Promise<Record<string, number>> {
  const rows = await getDb().select().from(fxRates).orderBy(desc(fxRates.day));
  const out: Record<string, number> = { BRL: 1 };
  for (const r of rows) {
    const [cur, to] = r.pair.split("-");
    if (cur && to === "BRL" && out[cur] == null) out[cur] = r.rate;
  }
  return out;
}

export async function getFxRate(currency: string) {
  if (currency === "BRL") return 1;
  const [row] = await getDb()
    .select()
    .from(fxRates)
    .where(eq(fxRates.pair, `${currency}-BRL`))
    .orderBy(desc(fxRates.day))
    .limit(1);
  return row?.rate ?? null;
}
