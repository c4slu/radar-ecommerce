import type { MarketListing, MarketSearchResult } from "@radar/core";
import { getAccessToken, MlError } from "./auth";

const API = "https://api.mercadolibre.com";
export const SITE = "MLB";

/** GET autenticado na API do ML, com renovação de token em 401 e espera em 429. */
export async function mlGet<T>(path: string, attempt = 0): Promise<T> {
  const token = await getAccessToken(attempt > 0 && attempt < 2);
  const res = await fetch(API + path, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.ok) return (await res.json()) as T;
  const body = await res.json().catch(() => null);
  if (res.status === 401 && attempt === 0) return mlGet<T>(path, 1);
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    return mlGet<T>(path, attempt + 1);
  }
  if (res.status === 403 && (body as { blocked_by?: string } | null)?.blocked_by === "PolicyAgent") {
    throw new MlError(
      `O Mercado Livre bloqueou este recurso para a sua aplicação (${path.split("?")[0]}). ` +
        "Desde 2025 a busca, o catálogo e as tendências só ficam liberados para aplicações autorizadas pelo ML.",
      403,
      body,
    );
  }
  throw new MlError(`ML ${res.status} em ${path}: ${JSON.stringify(body)?.slice(0, 300)}`, res.status, body);
}

export type MlListing = MarketListing;
export type MlSearchResult = MarketSearchResult;

interface SearchItem {
  id: string;
  title: string;
  price: number;
  sold_quantity?: number;
  seller?: { id: number; nickname?: string };
  official_store_id?: number | null;
  shipping?: { logistic_type?: string; free_shipping?: boolean };
  permalink?: string;
  category_id?: string;
}

/**
 * Busca anúncios por termo. Tenta a busca geral (/sites/MLB/search); se o ML bloquear
 * (403, comum desde 2025 para alguns apps), cai para o catálogo (/products/search +
 * /products/{id}/items), que traz os vendedores de cada produto de catálogo.
 */
export async function searchListings(query: string, limit = 50): Promise<MlSearchResult> {
  try {
    const r = await mlGet<{ paging: { total: number }; results: SearchItem[] }>(
      `/sites/${SITE}/search?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 50)}`,
    );
    return { marketplace: "mercadolivre", source: "search", total: r.paging.total, listings: r.results.map(fromSearchItem) };
  } catch (err) {
    if (!(err instanceof MlError) || err.status !== 403) throw err;
    return searchCatalog(query, limit);
  }
}

function fromSearchItem(i: SearchItem): MlListing {
  return {
    externalId: i.id,
    title: i.title,
    price: i.price,
    soldQuantity: i.sold_quantity ?? null,
    sellerId: i.seller?.id != null ? String(i.seller.id) : null,
    sellerName: i.seller?.nickname ?? null,
    isOfficialStore: i.official_store_id != null,
    isFulfillment: i.shipping?.logistic_type === "fulfillment",
    freeShipping: !!i.shipping?.free_shipping,
    url: i.permalink ?? null,
    categoryId: i.category_id ?? null,
  };
}

interface CatalogProduct {
  id: string;
  name: string;
  domain_id?: string;
}
interface CatalogItem {
  item_id: string;
  price: number;
  seller_id?: number;
  official_store_id?: number | null;
  shipping?: { logistic_type?: string; free_shipping?: boolean };
  category_id?: string;
  sold_quantity?: number;
}

async function searchCatalog(query: string, limit: number): Promise<MlSearchResult> {
  const products = await mlGet<{ paging?: { total: number }; results: CatalogProduct[] }>(
    `/products/search?status=active&site_id=${SITE}&q=${encodeURIComponent(query)}&limit=10`,
  );
  const listings: MlListing[] = [];
  for (const p of products.results) {
    if (listings.length >= limit) break;
    try {
      const items = await mlGet<{ results: CatalogItem[] }>(`/products/${p.id}/items?limit=20`);
      for (const i of items.results) {
        listings.push({
          externalId: i.item_id,
          title: p.name,
          price: i.price,
          soldQuantity: i.sold_quantity ?? null,
          sellerId: i.seller_id != null ? String(i.seller_id) : null,
          sellerName: null,
          isOfficialStore: i.official_store_id != null,
          isFulfillment: i.shipping?.logistic_type === "fulfillment",
          freeShipping: !!i.shipping?.free_shipping,
          url: `https://www.mercadolivre.com.br/p/${p.id}`,
          categoryId: i.category_id ?? null,
        });
      }
    } catch (err) {
      // produto de catálogo sem vendedores ativos responde 404: segue para o próximo
      if (!(err instanceof MlError) || err.status !== 404) throw err;
    }
  }
  return { marketplace: "mercadolivre", source: "catalog", total: products.paging?.total ?? listings.length, listings: listings.slice(0, limit) };
}

/** Palavras mais buscadas no ML (geral ou por categoria), em ordem de popularidade. */
export async function getTrends(categoryId?: string): Promise<{ keyword: string; url: string }[]> {
  return mlGet(`/trends/${SITE}${categoryId ? `/${categoryId}` : ""}`);
}

/** Sugere a categoria do ML para um termo (útil para preencher a categoria do produto). */
export async function predictCategory(query: string) {
  const r = await mlGet<{ category_id: string; category_name: string; domain_name?: string }[]>(
    `/sites/${SITE}/domain_discovery/search?limit=1&q=${encodeURIComponent(query)}`,
  );
  return r[0] ?? null;
}
