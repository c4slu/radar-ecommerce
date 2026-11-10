"use server";

import type { RankedOffer } from "@radar/suppliers";
import { requireUser } from "@/lib/auth";
import { confirmMatch, saveEstimate, searchSuppliers } from "@/lib/suppliers";
import { loadCalcProduct, loadFees, parseCatalogId, type CalcFees, type CalcProduct } from "@/lib/calculator-data";

export async function fetchCalcProduct(input: string): Promise<{ product?: CalcProduct; fees?: CalcFees; error?: string }> {
  await requireUser();
  const id = parseCatalogId(input);
  if (!id) return { error: "Cole um link de produto do catálogo do ML (…/p/MLB…) ou o ID MLB." };
  try {
    const product = await loadCalcProduct(id);
    const fees = await loadFees(product.priceMedian ?? product.priceMin ?? 0, product.categoryId);
    return { product, fees };
  } catch (err) {
    const msg = (err as Error).message;
    return { error: /404|not found/i.test(msg) ? "Produto não encontrado no catálogo. Links de anúncio (MLB-…) não são liberados: use o link do catálogo (/p/MLB…)." : msg };
  }
}

export async function fetchFees(price: number, categoryId: string | null): Promise<CalcFees> {
  await requireUser();
  return loadFees(price, categoryId);
}

// ---------- Fornecedores ----------


export interface SupplierSearchResult {
  configured: boolean;
  query: string;
  searched: string[];
  offers: RankedOffer[];
  errors: { source: string; message: string }[];
}

/** Busca o produto nos fornecedores e guarda a melhor oferta nacional como estimativa do item. */
export async function searchSupplierOffers(
  title: string,
  catalogId: string | null,
  query?: string,
  ids: { brand?: string | null; model?: string | null } = {},
): Promise<SupplierSearchResult> {
  await requireUser();
  const r = await searchSuppliers(title, query, ids);
  const best = r.offers.find((o) => o.landedCost != null);
  if (catalogId && best) await saveEstimate(catalogId, best, r.query).catch(() => null);
  return r;
}

export async function confirmSupplierOffer(catalogId: string, offer: RankedOffer, query: string | null) {
  await requireUser();
  await confirmMatch(catalogId, offer, query);
  return { ok: true };
}
