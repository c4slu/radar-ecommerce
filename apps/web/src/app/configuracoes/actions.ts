"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, marketplaceFees, settings } from "@radar/db";
import { requireUser } from "@/lib/auth";
import { SETTINGS_KEYS } from "@/lib/data";
import { firstError, formObject, zInt, zNum, zNumOpt, zPct, type ActionState } from "@/lib/forms";

const settingsSchema = z.object({
  taxPct: zPct().refine((v) => v >= 0 && v < 1, "Imposto entre 0 e 100%"),
  targetMargin: zPct().refine((v) => v >= 0 && v < 1, "Margem entre 0 e 100%"),
  expectedShare: zPct().refine((v) => v > 0 && v <= 1, "Fatia entre 0 e 100%"),
  coverageDays: zInt().refine((v) => v > 0, "Dias deve ser positivo"),
  maxDaysToSell: zInt().refine((v) => v > 15, "Use mais de 15 dias"),
  oppMaxListings: zInt().refine((v) => v >= 1, "Máximo de anúncios deve ser 1 ou mais"),
  oppPriceMin: zNum().refine((v) => v >= 0, "Preço mínimo inválido"),
  oppPriceMax: zNum().refine((v) => v > 0, "Preço máximo inválido"),
  sourcingMode: z.enum(["nacional", "importacao"]),
}).refine((d) => d.oppPriceMax > d.oppPriceMin, "Faixa de preço: o máximo deve ser maior que o mínimo");

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

export async function disconnectMl() {
  await requireUser();
  const { disconnect } = await import("@radar/ml");
  await disconnect();
  revalidatePath("/configuracoes");
}

// ---------- Catálogos de fornecedores nacionais ----------

const feedSchema = z.object({
  name: z.string({ error: "Informe o nome do fornecedor" }).min(2, "Nome muito curto"),
  url: z.url({ protocol: /^https?$/, error: "Informe o link do catálogo (http ou https)" }),
});

/** Cadastra o catálogo e já faz a primeira sincronização, para mostrar se o formato foi reconhecido. */
export async function addFeed(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = feedSchema.safeParse(formObject(fd));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { supplierFeeds } = await import("@radar/db");
  const { syncFeed } = await import("@radar/suppliers");
  const [row] = await getDb().insert(supplierFeeds).values(parsed.data).returning({ id: supplierFeeds.id });
  const r = await syncFeed(row!.id);
  revalidatePath("/configuracoes");
  return r.error
    ? { error: `Catálogo salvo, mas a leitura falhou: ${r.error}` }
    : { ok: `${r.items.toLocaleString("pt-BR")} produtos importados de ${r.name}` };
}

export async function syncFeedNow(id: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireUser();
  const { syncFeed } = await import("@radar/suppliers");
  const r = await syncFeed(id);
  revalidatePath("/configuracoes");
  return r.error ? { error: r.error } : { ok: `${r.items.toLocaleString("pt-BR")} produtos (${r.removed} removidos)` };
}

export async function deleteFeed(id: string) {
  await requireUser();
  const { supplierFeeds } = await import("@radar/db");
  await getDb().delete(supplierFeeds).where(eq(supplierFeeds.id, id));
  revalidatePath("/configuracoes");
}
