import "server-only";
import type { MarketSearchResult } from "@radar/core";
import { collectMarketListings, getConnection, searchListings } from "@radar/ml";
import { collectShopeeListings, searchShopee, shopeeConfigured } from "@radar/shopee";

export type SearchMarketplace = "shopee" | "mercadolivre";

export const MARKETPLACE_NAME: Record<string, string> = {
  mercadolivre: "Mercado Livre",
  shopee: "Shopee",
  tiktokshop: "TikTok Shop",
};

export async function searchMarket(mp: SearchMarketplace, q: string): Promise<MarketSearchResult> {
  return mp === "shopee" ? searchShopee(q, 50) : searchListings(q, 50);
}

/** Marketplaces com coleta disponível agora (credenciais/conexão presentes). */
export async function availableCollectors() {
  const ml = await getConnection().catch(() => ({ connected: false }));
  return { shopee: shopeeConfigured(), mercadolivre: ml.connected };
}

/**
 * Coleta em todos os marketplaces disponíveis. Falha em um não impede o outro;
 * devolve um resumo por marketplace para mostrar na tela.
 */
export async function collectAll(productIds: string[]) {
  const avail = await availableCollectors();
  const lines: { mp: string; ok: boolean; text: string }[] = [];
  if (avail.shopee) {
    try {
      const r = await collectShopeeListings(productIds);
      lines.push(r.errors.length ? { mp: "Shopee", ok: false, text: r.errors[0]! } : { mp: "Shopee", ok: true, text: `${r.listings} anúncios` });
    } catch (err) {
      lines.push({ mp: "Shopee", ok: false, text: (err as Error).message });
    }
  }
  if (avail.mercadolivre) {
    try {
      const r = await collectMarketListings(productIds);
      lines.push(
        r.errors.length ? { mp: "Mercado Livre", ok: false, text: r.errors[0]! } : { mp: "Mercado Livre", ok: true, text: `${r.listings} anúncios` },
      );
    } catch (err) {
      lines.push({ mp: "Mercado Livre", ok: false, text: (err as Error).message });
    }
  }
  return { avail, lines };
}
