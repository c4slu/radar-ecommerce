import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, mlSupplierMatches } from "@radar/db";
import { configuredAdapters, findSupplierOffers, type FindResult, type RankedOffer } from "@radar/suppliers";
import { getLatestFx, getSettings } from "./data";

export type SupplierMatch = typeof mlSupplierMatches.$inferSelect;

export const supplierStatus = async () => ({ configured: (await configuredAdapters()).map((a) => a.name) });

/** Busca nos fornecedores configurados com o câmbio do dia e o modo de compra das configurações. */
export async function searchSuppliers(
  title: string,
  query?: string,
  ids: { brand?: string | null; model?: string | null } = {},
): Promise<FindResult & { configured: boolean }> {
  if (!(await configuredAdapters()).length) return { query: query ?? "", offers: [], errors: [], searched: [], configured: false };
  const [fx, settings] = await Promise.all([getLatestFx(), getSettings()]);
  const r = await findSupplierOffers(title, { fx, mode: settings.sourcingMode, query, limit: 20, ...ids });
  return { ...r, configured: true };
}

const toRow = (catalogProductId: string, o: RankedOffer, query: string | null, confirmed: boolean) => ({
  catalogProductId,
  source: o.source,
  externalId: o.externalId,
  title: o.title,
  imageUrl: o.imageUrl,
  url: o.url,
  unitPrice: o.unitPrice,
  currency: o.currency,
  shipFrom: o.shipFrom,
  landedCost: o.landedCost,
  matchScore: o.matchScore,
  query,
  confirmed,
  fetchedAt: new Date(),
});

/** Guarda a melhor oferta como estimativa (sem sobrescrever um vínculo confirmado pelo usuário). */
export async function saveEstimate(catalogProductId: string, best: RankedOffer, query: string) {
  const db = getDb();
  const [confirmed] = await db
    .select({ id: mlSupplierMatches.id })
    .from(mlSupplierMatches)
    .where(and(eq(mlSupplierMatches.catalogProductId, catalogProductId), eq(mlSupplierMatches.confirmed, true)))
    .limit(1);
  if (confirmed) return;
  const row = toRow(catalogProductId, best, query, false);
  await db
    .insert(mlSupplierMatches)
    .values(row)
    .onConflictDoUpdate({ target: [mlSupplierMatches.catalogProductId, mlSupplierMatches.source, mlSupplierMatches.externalId], set: row });
}

/** O usuário confirmou que a oferta é o mesmo produto: vira o fornecedor do item (único confirmado). */
export async function confirmMatch(catalogProductId: string, offer: RankedOffer, query: string | null) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.update(mlSupplierMatches).set({ confirmed: false }).where(eq(mlSupplierMatches.catalogProductId, catalogProductId));
    const row = toRow(catalogProductId, offer, query, true);
    await tx
      .insert(mlSupplierMatches)
      .values(row)
      .onConflictDoUpdate({ target: [mlSupplierMatches.catalogProductId, mlSupplierMatches.source, mlSupplierMatches.externalId], set: row });
  });
}

/** Vínculo atual de um produto do catálogo: o confirmado, senão a última estimativa. */
export async function currentMatch(catalogProductId: string): Promise<SupplierMatch | null> {
  const rows = await getDb()
    .select()
    .from(mlSupplierMatches)
    .where(eq(mlSupplierMatches.catalogProductId, catalogProductId))
    .orderBy(desc(mlSupplierMatches.confirmed), desc(mlSupplierMatches.fetchedAt))
    .limit(1)
    .catch(() => []);
  return rows[0] ?? null;
}
