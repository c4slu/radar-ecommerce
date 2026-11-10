import { mlGet, SITE } from "./api";
import { MlError } from "./auth";

/**
 * Endpoints do catálogo do ML liberados para a aplicação (testados em 11/2026):
 * highlights (mais vendidos), produtos de catálogo, vendedores do produto, tarifas e categorias.
 * Item individual, visitas e a busca geral continuam bloqueados (403).
 */

// ---------- Limite de ritmo ----------

const MIN_INTERVAL_MS = 200; // ~5 requisições/s no total
let nextSlot = 0;

/** Espera a vez: espaça o início das requisições para não tomar 429 do ML. */
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

async function get<T>(path: string): Promise<T> {
  await throttle();
  return mlGet<T>(path);
}

/** Executa `fn` sobre os itens com no máximo `limit` em paralelo. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!, idx);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------- Categorias ----------

export interface MlCategory {
  id: string;
  name: string;
  totalItems: number | null;
  path: { id: string; name: string }[];
  children: { id: string; name: string; totalItems: number | null }[];
}

export async function getCategory(id: string): Promise<MlCategory> {
  const c = await get<{
    id: string;
    name: string;
    total_items_in_this_category?: number;
    path_from_root?: { id: string; name: string }[];
    children_categories?: { id: string; name: string; total_items_in_this_category?: number }[];
  }>(`/categories/${id}`);
  return {
    id: c.id,
    name: c.name,
    totalItems: c.total_items_in_this_category ?? null,
    path: c.path_from_root ?? [],
    children: (c.children_categories ?? []).map((ch) => ({ id: ch.id, name: ch.name, totalItems: ch.total_items_in_this_category ?? null })),
  };
}

/**
 * Categorias raiz do MLB. A lista oficial (/sites/MLB/categories) é bloqueada para a aplicação,
 * então fica aqui (validada com /categories/{id}). `enabled: false` = não serve para revenda.
 */
export const ROOT_CATEGORIES: { id: string; enabled: boolean }[] = [
  { id: "MLB5672", enabled: true }, // Acessórios para Veículos
  { id: "MLB271599", enabled: true }, // Agro
  { id: "MLB1403", enabled: true }, // Alimentos e Bebidas
  { id: "MLB1071", enabled: true }, // Pet Shop
  { id: "MLB1367", enabled: false }, // Antiguidades e Coleções
  { id: "MLB1368", enabled: true }, // Arte, Papelaria e Armarinho
  { id: "MLB1384", enabled: true }, // Bebês
  { id: "MLB1246", enabled: true }, // Beleza e Cuidado Pessoal
  { id: "MLB1132", enabled: true }, // Brinquedos e Hobbies
  { id: "MLB1430", enabled: true }, // Calçados, Roupas e Bolsas
  { id: "MLB1039", enabled: true }, // Câmeras e Acessórios
  { id: "MLB1743", enabled: false }, // Carros, Motos e Outros
  { id: "MLB1574", enabled: true }, // Casa, Móveis e Decoração
  { id: "MLB1051", enabled: true }, // Celulares e Telefones
  { id: "MLB1500", enabled: true }, // Construção
  { id: "MLB5726", enabled: true }, // Eletrodomésticos
  { id: "MLB1000", enabled: true }, // Eletrônicos, Áudio e Vídeo
  { id: "MLB1276", enabled: true }, // Esportes e Fitness
  { id: "MLB263532", enabled: true }, // Ferramentas
  { id: "MLB12404", enabled: true }, // Festas e Lembrancinhas
  { id: "MLB1144", enabled: true }, // Games
  { id: "MLB1459", enabled: false }, // Imóveis
  { id: "MLB1499", enabled: true }, // Indústria e Comércio
  { id: "MLB1648", enabled: true }, // Informática
  { id: "MLB218519", enabled: false }, // Ingressos
  { id: "MLB1182", enabled: true }, // Instrumentos Musicais
  { id: "MLB3937", enabled: true }, // Joias e Relógios
  { id: "MLB1196", enabled: true }, // Livros, Revistas e Comics
  { id: "MLB1168", enabled: true }, // Música, Filmes e Seriados
  { id: "MLB264586", enabled: true }, // Saúde
  { id: "MLB1540", enabled: false }, // Serviços
  { id: "MLB1953", enabled: true }, // Mais Categorias
];

// ---------- Mais vendidos ----------

export interface Highlight {
  id: string;
  position: number;
  /** PRODUCT = produto de catálogo (tem detalhe); ITEM / USER_PRODUCT não têm detalhe liberado */
  type: string;
}

/** Top 20 mais vendidos da categoria. Categorias sem ranking devolvem lista vazia. */
export async function getHighlights(categoryId: string): Promise<Highlight[]> {
  try {
    const r = await get<{ content?: Highlight[] }>(`/highlights/${SITE}/category/${categoryId}`);
    return r.content ?? [];
  } catch (err) {
    if (err instanceof MlError && (err.status === 404 || err.status === 400)) return [];
    throw err;
  }
}

// ---------- Produto de catálogo ----------

export interface CatalogProduct {
  id: string;
  name: string;
  domainId: string | null;
  pictureUrl: string | null;
  permalink: string;
  createdAt: Date | null;
}

export async function getCatalogProduct(id: string): Promise<CatalogProduct> {
  const p = await get<{
    id: string;
    name: string;
    domain_id?: string;
    permalink?: string;
    date_created?: string;
    pictures?: { url?: string; secure_url?: string }[];
  }>(`/products/${id}`);
  const pic = p.pictures?.[0];
  return {
    id: p.id,
    name: p.name,
    domainId: p.domain_id ?? null,
    pictureUrl: pic?.secure_url ?? pic?.url ?? null,
    permalink: p.permalink || `https://www.mercadolivre.com.br/p/${p.id}`,
    createdAt: p.date_created ? new Date(p.date_created) : null,
  };
}

export interface Offer {
  itemId: string;
  sellerId: string | null;
  price: number;
  listingType: string;
  isFull: boolean;
  isOfficial: boolean;
  freeShipping: boolean;
  categoryId: string | null;
}

export interface ProductOffers {
  /** total de anúncios ativos do produto no catálogo */
  total: number;
  offers: Offer[];
}

/** Anúncios (vendedores) de um produto de catálogo; lê até `max`, mas `total` é o número completo. */
export async function getProductOffers(id: string, max = 50): Promise<ProductOffers> {
  try {
    const r = await get<{
      paging?: { total: number };
      results: {
        item_id: string;
        seller_id?: number;
        price: number;
        listing_type_id?: string;
        official_store_id?: number | null;
        category_id?: string;
        shipping?: { logistic_type?: string; free_shipping?: boolean };
      }[];
    }>(`/products/${id}/items?limit=${Math.min(max, 50)}`);
    return {
      total: r.paging?.total ?? r.results.length,
      offers: r.results.map((i) => ({
        itemId: i.item_id,
        sellerId: i.seller_id != null ? String(i.seller_id) : null,
        price: i.price,
        listingType: i.listing_type_id ?? "",
        isFull: i.shipping?.logistic_type === "fulfillment",
        isOfficial: i.official_store_id != null,
        freeShipping: !!i.shipping?.free_shipping,
        categoryId: i.category_id ?? null,
      })),
    };
  } catch (err) {
    // produto sem anúncios ativos responde 404
    if (err instanceof MlError && err.status === 404) return { total: 0, offers: [] };
    throw err;
  }
}

// ---------- Tarifas ----------

export interface ListingFee {
  listingTypeId: string;
  name: string;
  percentageFee: number;
  fixedFee: number;
  /** tarifa total em R$ para o preço consultado */
  amount: number;
}

/** Tarifa oficial de venda (Clássico = gold_special, Premium = gold_pro) para um preço e categoria. */
export async function getListingFees(price: number, categoryId: string): Promise<ListingFee[]> {
  const r = await get<
    {
      listing_type_id: string;
      listing_type_name: string;
      sale_fee_amount: number;
      sale_fee_details?: { fixed_fee?: number; percentage_fee?: number };
    }[]
  >(`/sites/${SITE}/listing_prices?price=${price.toFixed(2)}&category_id=${categoryId}`);
  return r
    .filter((x) => x.listing_type_id === "gold_special" || x.listing_type_id === "gold_pro")
    .map((x) => ({
      listingTypeId: x.listing_type_id,
      name: x.listing_type_name,
      percentageFee: x.sale_fee_details?.percentage_fee ?? 0,
      fixedFee: x.sale_fee_details?.fixed_fee ?? 0,
      amount: x.sale_fee_amount,
    }));
}
