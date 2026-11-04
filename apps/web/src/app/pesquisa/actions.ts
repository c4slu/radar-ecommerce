"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, products } from "@radar/db";
import { collectMarketListings } from "@radar/ml";
import { requireUser } from "@/lib/auth";

/** Cria um produto "em pesquisa" a partir do termo pesquisado e já coleta os concorrentes. */
export async function trackTerm(term: string, categoryId: string | null) {
  await requireUser();
  const clean = term.trim();
  const base = clean
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  const sku = `PESQ-${base}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  const [row] = await getDb()
    .insert(products)
    .values({ sku, name: clean, searchTerms: [clean], status: "pesquisa", mlCategoryId: categoryId })
    .returning({ id: products.id });
  await collectMarketListings([row!.id]).catch(() => null);
  revalidatePath("/produtos");
  redirect(`/produtos/${row!.id}`);
}
