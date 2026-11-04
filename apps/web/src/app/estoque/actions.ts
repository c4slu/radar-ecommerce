"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, inventoryLots, stockMovements } from "@radar/db";
import { requireUser } from "@/lib/auth";
import { firstError, formObject, zInt, zNum, zNumOpt, type ActionState } from "@/lib/forms";

const revalidate = (productId: string) => {
  revalidatePath("/estoque");
  revalidatePath("/produtos");
  revalidatePath(`/produtos/${productId}`);
  revalidatePath("/");
};

const lotSchema = z.object({
  productId: z.uuid("Escolha o produto"),
  supplierId: z.uuid().optional(),
  quantity: zInt().refine((v) => v > 0, "Quantidade deve ser maior que zero"),
  landedUnitCost: zNum().refine((v) => v > 0, "Custo deve ser maior que zero"),
  receivedAt: z.string().optional(),
  notes: z.string().optional(),
});

/** Registra a chegada de um lote: cria o lote e a movimentação de entrada. */
export async function addLot(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = lotSchema.safeParse(formObject(fd));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const d = parsed.data;
  await getDb().transaction(async (tx) => {
    const [lot] = await tx.insert(inventoryLots).values(d).returning({ id: inventoryLots.id });
    await tx.insert(stockMovements).values({
      productId: d.productId,
      lotId: lot!.id,
      type: "entrada",
      quantity: d.quantity,
      unitPrice: d.landedUnitCost,
      occurredAt: d.receivedAt ? new Date(`${d.receivedAt}T12:00:00`) : new Date(),
      notes: d.notes,
    });
  });
  revalidate(d.productId);
  return { ok: `Lote de ${d.quantity} un. registrado` };
}

const movementSchema = z.object({
  productId: z.uuid("Escolha o produto"),
  type: z.enum(["saida", "ajuste"]),
  quantity: zInt().refine((v) => v !== 0, "Quantidade não pode ser zero"),
  marketplace: z.enum(["mercadolivre", "shopee", "tiktokshop"]).optional(),
  unitPrice: zNumOpt(),
  occurredAt: z.string().optional(),
  notes: z.string().optional(),
});

/** Saída (venda) ou ajuste de inventário. Saídas são gravadas com quantidade negativa. */
export async function addMovement(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = movementSchema.safeParse(formObject(fd));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const d = parsed.data;
  if (d.type === "saida" && d.quantity < 0) return { error: "Na saída, informe a quantidade positiva" };
  await getDb()
    .insert(stockMovements)
    .values({
      ...d,
      quantity: d.type === "saida" ? -d.quantity : d.quantity,
      marketplace: d.type === "saida" ? d.marketplace : undefined,
      occurredAt: d.occurredAt ? new Date(`${d.occurredAt}T12:00:00`) : new Date(),
    });
  revalidate(d.productId);
  return { ok: d.type === "saida" ? `Saída de ${d.quantity} un. registrada` : "Ajuste registrado" };
}

/** Exclui uma movimentação; se for a entrada de um lote, exclui o lote junto. */
export async function deleteMovement(id: string) {
  await requireUser();
  const db = getDb();
  const [m] = await db.select().from(stockMovements).where(eq(stockMovements.id, id));
  if (!m) return;
  await db.transaction(async (tx) => {
    await tx.delete(stockMovements).where(eq(stockMovements.id, id));
    if (m.type === "entrada" && m.lotId) await tx.delete(inventoryLots).where(eq(inventoryLots.id, m.lotId));
  });
  revalidate(m.productId);
}
