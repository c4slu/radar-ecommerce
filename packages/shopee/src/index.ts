import { createHash } from "node:crypto";
import { and, inArray } from "drizzle-orm";
import type { MarketListing, MarketSearchResult } from "@radar/core";
import { getDb, products, refreshTodaySnapshots, saveMarketListings } from "@radar/db";

/**
 * API de afiliados da Shopee Brasil (oficial e gratuita).
 * Credenciais: painel de afiliados > Open API > App ID e Secret
 * (https://affiliate.shopee.com.br/open_api). O acesso à Open API precisa ser liberado pela Shopee.
 */
const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";

export class ShopeeError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

export const shopeeConfigured = () => Boolean(process.env.SHOPEE_APP_ID && process.env.SHOPEE_APP_SECRET);

/** Explicação em português para os códigos de erro mais comuns da Open API. */
const ERROR_HINTS: Record<number, string> = {
  10020: "assinatura inválida: confira SHOPEE_APP_ID e SHOPEE_APP_SECRET",
  10030: "limite de requisições da Shopee atingido; tente mais tarde",
  10035: "sua conta de afiliado ainda não tem acesso à Open API: solicite no painel de afiliados da Shopee",
};

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const appId = process.env.SHOPEE_APP_ID;
  const secret = process.env.SHOPEE_APP_SECRET;
  if (!appId || !secret) throw new ShopeeError("Shopee não configurada: defina SHOPEE_APP_ID e SHOPEE_APP_SECRET no .env");
  const payload = JSON.stringify({ query, variables });
  const ts = Math.floor(Date.now() / 1000);
  const signature = createHash("sha256").update(`${appId}${ts}${payload}${secret}`).digest("hex");

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `SHA256 Credential=${appId}, Timestamp=${ts}, Signature=${signature}`,
      },
      body: payload,
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status >= 500 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
      continue;
    }
    const body = (await res.json().catch(() => null)) as {
      data?: T;
      errors?: { message: string; extensions?: { code?: number } }[];
    } | null;
    const err = body?.errors?.[0];
    if (err || !body?.data) {
      const code = err?.extensions?.code;
      throw new ShopeeError(`Shopee: ${(code && ERROR_HINTS[code]) || err?.message || `HTTP ${res.status}`}`, code);
    }
    return body.data;
  }
}

interface ProductOffer {
  itemId: number | string;
  shopId: number | string;
  productName: string;
  priceMin: string;
  priceMax: string;
  sales: number | null;
  shopName: string | null;
  shopType: number[] | null;
  productLink: string | null;
  productCatIds: number[] | null;
}

const OFFERS_QUERY = `
query ($keyword: String, $page: Int, $limit: Int, $sortType: Int) {
  productOfferV2(keyword: $keyword, page: $page, limit: $limit, sortType: $sortType) {
    nodes { itemId shopId productName priceMin priceMax sales shopName shopType productLink productCatIds }
    pageInfo { page limit hasNextPage }
  }
}`;

/** shopType da Shopee: 1 = Mall (loja oficial), 2 = Indicado, 4 = Indicado+ */
const SHOP_MALL = 1;
const SHOP_PREFERRED = [2, 4];

/** sortType 2 = mais vendidos (os anúncios que de fato disputam a venda). */
export async function searchShopee(keyword: string, limit = 50): Promise<MarketSearchResult> {
  const data = await graphql<{ productOfferV2: { nodes: ProductOffer[]; pageInfo: { hasNextPage: boolean } } }>(OFFERS_QUERY, {
    keyword,
    page: 1,
    limit: Math.min(limit, 50),
    sortType: 2,
  });
  const listings: MarketListing[] = data.productOfferV2.nodes.map((o) => ({
    externalId: `${o.shopId}-${o.itemId}`,
    title: o.productName,
    // preço do anúncio: o menor entre as variações
    price: Number(o.priceMin),
    soldQuantity: o.sales ?? null,
    sellerId: String(o.shopId),
    sellerName: o.shopName,
    isOfficialStore: !!o.shopType?.includes(SHOP_MALL),
    isFulfillment: !!o.shopType?.some((t) => SHOP_PREFERRED.includes(t)),
    freeShipping: false,
    url: o.productLink,
    categoryId: o.productCatIds?.at(-1) != null ? String(o.productCatIds.at(-1)) : null,
  }));
  return {
    marketplace: "shopee",
    source: "affiliate",
    total: listings.length,
    listings: listings.filter((l) => Number.isFinite(l.price) && l.price > 0),
  };
}

const ACTIVE = ["pesquisa", "aprovado", "ativo"] as const;

/** Coleta concorrentes na Shopee para os produtos ativos (ou os indicados). */
export async function collectShopeeListings(productIds?: string[]) {
  const db = getDb();
  const list = await db
    .select()
    .from(products)
    .where(and(inArray(products.status, [...ACTIVE]), productIds?.length ? inArray(products.id, productIds) : undefined));
  const result = { products: 0, listings: 0, errors: [] as string[] };
  for (const p of list) {
    const byId = new Map<string, MarketListing>();
    try {
      for (const term of (p.searchTerms.length ? p.searchTerms : [p.name]).slice(0, 3)) {
        for (const l of (await searchShopee(term)).listings) if (!byId.has(l.externalId)) byId.set(l.externalId, l);
      }
    } catch (err) {
      result.errors.push(`${p.sku}: ${(err as Error).message}`);
      // credencial/acesso inválido vale para todos: não insiste
      if (err instanceof ShopeeError && [10020, 10035].includes(err.code ?? 0)) break;
      continue;
    }
    result.listings += await saveMarketListings(p.id, "shopee", [...byId.values()]);
    result.products++;
  }
  if (result.listings) await refreshTodaySnapshots();
  return result;
}
