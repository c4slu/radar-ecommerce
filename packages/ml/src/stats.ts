import type { MlListing } from "./api";

export interface ListingStats {
  count: number;
  sellers: number;
  priceMin: number | null;
  priceMedian: number | null;
  priceMax: number | null;
  /** fração de anúncios de loja oficial ou Full */
  officialShare: number;
  freeShippingShare: number;
  soldTotal: number | null;
}

/** Resumo de uma lista de anúncios (mesma lógica do agregado diário no banco). */
export function listingStats(listings: MlListing[]): ListingStats {
  const prices = listings.map((l) => l.price).sort((a, b) => a - b);
  const n = prices.length;
  const median = n === 0 ? null : n % 2 ? prices[(n - 1) / 2]! : (prices[n / 2 - 1]! + prices[n / 2]!) / 2;
  const sold = listings.map((l) => l.soldQuantity).filter((v): v is number => v != null);
  return {
    count: n,
    sellers: new Set(listings.map((l) => l.sellerId).filter(Boolean)).size,
    priceMin: n ? prices[0]! : null,
    priceMedian: median,
    priceMax: n ? prices[n - 1]! : null,
    officialShare: n ? listings.filter((l) => l.isOfficialStore || l.isFulfillment).length / n : 0,
    freeShippingShare: n ? listings.filter((l) => l.freeShipping).length / n : 0,
    soldTotal: sold.length ? sold.reduce((a, b) => a + b, 0) : null,
  };
}
