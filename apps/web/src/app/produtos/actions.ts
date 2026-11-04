"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, products, supplierQuotes } from "@radar/db";
import { requireUser } from "@/lib/auth";
import { firstError, formObject, zIntOpt, zNum, zNumOpt, type ActionState } from "@/lib/forms";

const productSchema = z.object({
  sku: z.string({ error: "Informe o SKU" }).min(1).transform((v) => v.toUpperCase()),
  name: z.string({ error: "Informe o nome" }).min(2, "Nome muito curto"),
  category: z.string().optional(),
  mlCategoryId: z.string().optional().transform((v) => v?.toUpperCase()),
  weightGrams: zIntOpt(),
  lengthCm: zNumOpt(),
  widthCm: zNumOpt(),
  heightCm: zNumOpt(),
  searchTerms: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean) : [])),
  status: z.enum(["pesquisa", "aprovado", "ativo", "descontinuado"]),
  notes: z.string().optional(),
});

const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && "cause" in e && (e as { cause?: { code?: string } }).cause?.code === "23505";

export async function saveProduct(id: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = productSchema.safeParse(formObject(fd));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const db = getDb();
  let newId: string | undefined;
  try {
    if (id) await db.update(products).set(parsed.data).where(eq(products.id, id));
    else newId = (await db.insert(products).values(parsed.data).returning({ id: products.id }))[0]?.id;
  } catch (e) {
    if (isUniqueViolation(e)) return { error: `Já existe um produto com o SKU ${parsed.data.sku}` };
    throw e;
  }
  revalidatePath("/produtos");
  if (newId) redirect(`/produtos/${newId}`);
  revalidatePath(`/produtos/${id}`);
  return { ok: "Produto atualizado" };
}

/** Exclui; se já houver estoque/lotes, apenas marca como descontinuado. */
export async function deleteProduct(id: string) {
  await requireUser();
  const db = getDb();
  try {
    await db.delete(products).where(eq(products.id, id));
  } catch {
    await db.update(products).set({ status: "descontinuado" }).where(eq(products.id, id));
    revalidatePath(`/produtos/${id}`);
    redirect(`/produtos/${id}?aviso=descontinuado`);
  }
  revalidatePath("/produtos");
  redirect("/produtos");
}

const quoteSchema = z.object({
  supplierId: z.uuid("Escolha o fornecedor"),
  unitPrice: zNum().refine((v) => v > 0, "Preço deve ser maior que zero"),
  currency: z.enum(["BRL", "USD", "CNY"]),
  minQty: zIntOpt(),
  freightTotal: zNumOpt(),
  otherCostsTotal: zNumOpt(),
  validUntil: z.string().optional(),
  quotedAt: z.string().optional(),
  notes: z.string().optional(),
});

export async function addQuote(productId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = quoteSchema.safeParse(formObject(fd));
  if (!parsed.success) return { error: firstError(parsed.error) };
  await getDb().insert(supplierQuotes).values({ ...parsed.data, productId });
  revalidatePath(`/produtos/${productId}`);
  return { ok: "Cotação adicionada" };
}

export async function deleteQuote(productId: string, quoteId: string) {
  await requireUser();
  await getDb()
    .delete(supplierQuotes)
    .where(and(eq(supplierQuotes.id, quoteId), eq(supplierQuotes.productId, productId)));
  revalidatePath(`/produtos/${productId}`);
}
