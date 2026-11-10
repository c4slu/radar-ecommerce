"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, mlCatalogProducts, products } from "@radar/db";
import { requireUser } from "@/lib/auth";

/** Transforma uma oportunidade em produto do Radar (em pesquisa) para cotar e acompanhar. */
export async function trackOpportunity(catalogId: string) {
  await requireUser();
  const db = getDb();
  const [p] = await db.select().from(mlCatalogProducts).where(eq(mlCatalogProducts.id, catalogId));
  if (!p) throw new Error("Produto não encontrado");
  const sku = `ML-${catalogId.replace(/^MLB/, "")}`;
  const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.sku, sku));
  if (existing) redirect(`/produtos/${existing.id}`);
  // termo de busca: nome sem detalhes depois de vírgula/parênteses, limitado
  const term = p.name.split(/[,(]/)[0]!.trim().split(/\s+/).slice(0, 6).join(" ");
  const [row] = await db
    .insert(products)
    .values({
      sku,
      name: p.name,
      searchTerms: [term],
      status: "pesquisa",
      mlCategoryId: p.categoryId,
      notes: `Oportunidade do catálogo ML ${catalogId}: ${p.permalink ?? ""}`,
    })
    .returning({ id: products.id });
  revalidatePath("/produtos");
  redirect(`/produtos/${row!.id}`);
}
