import { sql } from "drizzle-orm";
import { getDb } from "./index";
import { marketListings } from "./schema";

type Marketplace = (typeof marketListings.$inferInsert)["marketplace"];

/** Formato mínimo de anúncio aceito (compatível com MarketListing do core). */
export interface ListingInput {
  externalId: string;
  title: string;
  price: number;
  soldQuantity: number | null;
  sellerId: string | null;
  sellerName: string | null;
  isOfficialStore: boolean;
  isFulfillment: boolean;
  url: string | null;
}

/** Grava um lote de anúncios coletados de um produto num marketplace. */
export async function saveMarketListings(productId: string, marketplace: Marketplace, listings: ListingInput[]) {
  if (!listings.length) return 0;
  await getDb()
    .insert(marketListings)
    .values(
      listings.map((l) => ({
        productId,
        marketplace,
        externalId: l.externalId,
        title: l.title.slice(0, 500),
        price: l.price,
        soldQuantity: l.soldQuantity,
        sellerId: l.sellerId,
        sellerName: l.sellerName,
        isOfficialStore: l.isOfficialStore,
        isFulfillment: l.isFulfillment,
        url: l.url,
      })),
    );
  return listings.length;
}

/** Recalcula o agregado de hoje (dia de Brasília) em market_snapshots. */
export async function refreshTodaySnapshots() {
  await getDb().execute(sql`select public.aggregate_market_snapshots((now() at time zone 'America/Sao_Paulo')::date)`);
}
