"use server";

import { requireUser } from "@/lib/auth";
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
