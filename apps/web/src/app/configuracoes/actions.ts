"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, marketplaceFees, settings } from "@radar/db";
import { requireUser } from "@/lib/auth";
import { SETTINGS_KEYS } from "@/lib/data";
import { firstError, formObject, zInt, zNumOpt, zPct, type ActionState } from "@/lib/forms";

const settingsSchema = z.object({
  taxPct: zPct().refine((v) => v >= 0 && v < 1, "Imposto entre 0 e 100%"),
  targetMargin: zPct().refine((v) => v >= 0 && v < 1, "Margem entre 0 e 100%"),
  expectedShare: zPct().refine((v) => v > 0 && v <= 1, "Fatia entre 0 e 100%"),
  coverageDays: zInt().refine((v) => v > 0, "Dias deve ser positivo"),
  maxDaysToSell: zInt().refine((v) => v > 15, "Use mais de 15 dias"),
});

export async function saveSettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = settingsSchema.safeParse(formObject(fd));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const rows = Object.entries(parsed.data).map(([k, value]) => ({
    key: SETTINGS_KEYS[k as keyof typeof parsed.data],
    value,
  }));
  await getDb()
    .insert(settings)
    .values(rows)
    .onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value`, updatedAt: new Date() } });
  revalidatePath("/", "layout");
  return { ok: "Parâmetros salvos" };
}

const feeSchema = z
  .object({
    marketplace: z.enum(["mercadolivre", "shopee", "tiktokshop"]),
    label: z.string().optional(),
    categoryId: z
      .string()
      .optional()
      .transform((v) => v?.toUpperCase()),
    commissionPct: zPct().refine((v) => v >= 0 && v < 1, "Comissão entre 0 e 100%"),
    fixedFee: zNumOpt().transform((v) => v ?? 0),
    minPrice: zNumOpt(),
    maxPrice: zNumOpt(),
  })
  .refine((d) => d.minPrice == null || d.maxPrice == null || d.maxPrice > d.minPrice, "Preço máximo deve ser maior que o mínimo");

export async function addFee(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = feeSchema.safeParse(formObject(fd));
  if (!parsed.success) return { error: firstError(parsed.error) };
  await getDb().insert(marketplaceFees).values(parsed.data);
  revalidatePath("/", "layout");
  return { ok: "Tarifa adicionada" };
}

export async function deleteFee(id: string) {
  await requireUser();
  await getDb().delete(marketplaceFees).where(eq(marketplaceFees.id, id));
  revalidatePath("/", "layout");
}
