import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, mlBestsellerRanks, mlCatalogProducts, mlCategories, mlOfferSnapshots } from "@radar/db";
import { median } from "@radar/core";
import { MlError } from "./auth";
import { getCatalogProduct, getCategory, getHighlights, getProductOffers, mapLimit, ROOT_CATEGORIES } from "./catalog";

export const todayBrt = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/**
 * Carrega as categorias raiz e suas filhas diretas em ml_categories.
 * Não altera `enabled` de categorias já existentes (o usuário pode ter ligado/desligado).
 */
export async function syncCategoryTree(): Promise<number> {
  const db = getDb();
  let count = 0;
  for (const root of ROOT_CATEGORIES) {
    let cat;
    try {
      cat = await getCategory(root.id);
    } catch (err) {
      if (err instanceof MlError && err.status === 404) continue;
      throw err;
    }
    const rows = [
      { id: cat.id, name: cat.name, parentId: null, level: 1, path: cat.name, totalItems: cat.totalItems, enabled: root.enabled },
      ...cat.children.map((ch) => ({
        id: ch.id,
        name: ch.name,
        parentId: cat.id,
        level: 2,
        path: `${cat.name} > ${ch.name}`,
        totalItems: ch.totalItems,
        enabled: root.enabled,
      })),
    ];
    await db
      .insert(mlCategories)
      .values(rows)
      .onConflictDoUpdate({
        target: mlCategories.id,
        set: { name: sql`excluded.name`, parentId: sql`excluded.parent_id`, level: sql`excluded.level`, path: sql`excluded.path`, totalItems: sql`excluded.total_items` },
      });
    count += rows.length;
  }
  return count;
}

export interface BestsellerRun {
  categories: number;
  ranks: number;
  products: number;
  newProducts: number;
  snapshots: number;
  errors: string[];
  /** só no dry-run: amostra do que seria gravado */
  sample?: { id: string; name: string; listings: number; priceMin: number | null }[];
}

/**
 * Coleta diária: ranking de mais vendidos de cada categoria habilitada + retrato da
 * concorrência (anúncios, preços, Full, oficiais) de cada produto de catálogo que apareceu.
 */
export async function collectBestsellers(opts: { limitCategories?: number; dryRun?: boolean; log?: (m: string) => void } = {}): Promise<BestsellerRun> {
  const db = getDb();
  const log = opts.log ?? (() => {});
  const day = todayBrt();
  const run: BestsellerRun = { categories: 0, ranks: 0, products: 0, newProducts: 0, snapshots: 0, errors: [] };

  // no dry-run as categorias vêm da lista fixa de raízes, sem tocar no banco
  let cats = opts.dryRun
    ? ROOT_CATEGORIES.filter((r) => r.enabled).map((r) => ({ id: r.id, path: r.id }))
    : await db.select({ id: mlCategories.id, path: mlCategories.path }).from(mlCategories).where(eq(mlCategories.enabled, true));
  if (!cats.length && !opts.dryRun) {
    // primeira coleta num banco novo: carrega a árvore de categorias antes
    log("nenhuma categoria cadastrada: sincronizando a árvore de categorias primeiro");
    log(`${await syncCategoryTree()} categorias sincronizadas`);
    cats = await db.select({ id: mlCategories.id, path: mlCategories.path }).from(mlCategories).where(eq(mlCategories.enabled, true));
  }
  if (!cats.length) throw new Error("Nenhuma categoria habilitada em ml_categories.");
  if (opts.limitCategories) cats = cats.slice(0, opts.limitCategories);

  // 1) rankings
  const productIds = new Set<string>();
  const productCategory = new Map<string, string>();
  await mapLimit(cats, 3, async (c) => {
    try {
      const hl = await getHighlights(c.id);
      run.categories++;
      if (!hl.length) return;
      for (const h of hl) {
        if (h.type === "PRODUCT") {
          productIds.add(h.id);
          if (!productCategory.has(h.id)) productCategory.set(h.id, c.id);
        }
      }
      run.ranks += hl.length;
      if (opts.dryRun) return;
      await db
        .insert(mlBestsellerRanks)
        .values(hl.map((h) => ({ productId: h.id, categoryId: c.id, day, position: h.position, type: h.type })))
        .onConflictDoUpdate({
          target: [mlBestsellerRanks.productId, mlBestsellerRanks.categoryId, mlBestsellerRanks.day],
          set: { position: sql`excluded.position`, type: sql`excluded.type` },
        });
      await db.update(mlCategories).set({ lastScannedAt: new Date() }).where(eq(mlCategories.id, c.id));
    } catch (err) {
      if (err instanceof MlError && err.status === 401) throw err;
      run.errors.push(`categoria ${c.id}: ${(err as Error).message}`);
    }
  });
  log(`${run.categories} categorias, ${run.ranks} posições, ${productIds.size} produtos de catálogo`);

  // 2) produtos e concorrência (cada produto uma vez, mesmo que esteja em várias categorias)
  const ids = [...productIds];
  const known = new Set(
    ids.length && !opts.dryRun
      ? (await db.select({ id: mlCatalogProducts.id }).from(mlCatalogProducts).where(inArray(mlCatalogProducts.id, ids))).map((r) => r.id)
      : [],
  );
  const sample: { id: string; name: string; listings: number; priceMin: number | null }[] = [];
  let done = 0;
  await mapLimit(ids, 4, async (id) => {
    try {
      if (!known.has(id)) {
        const p = await getCatalogProduct(id);
        run.newProducts++;
        if (opts.dryRun && sample.length < 15) sample.push({ id, name: p.name, listings: -1, priceMin: null });
        if (!opts.dryRun)
          await db
            .insert(mlCatalogProducts)
            .values({
              id: p.id,
              name: p.name,
              domainId: p.domainId,
              categoryId: productCategory.get(id) ?? null,
              pictureUrl: p.pictureUrl,
              permalink: p.permalink,
              catalogCreatedAt: p.createdAt,
              firstSeen: day,
              lastSeen: day,
            })
            .onConflictDoNothing();
      } else if (!opts.dryRun) {
        await db.update(mlCatalogProducts).set({ lastSeen: day }).where(eq(mlCatalogProducts.id, id));
      }
      const { total, offers } = await getProductOffers(id);
      run.products++;
      const prices = offers.map((o) => o.price).sort((a, b) => a - b);
      const snap = {
        productId: id,
        day,
        listingsCount: total,
        sellersCount: new Set(offers.map((o) => o.sellerId).filter(Boolean)).size,
        priceMin: prices[0] ?? null,
        priceMedian: prices.length ? median(prices) : null,
        priceMax: prices.at(-1) ?? null,
        fullCount: offers.filter((o) => o.isFull).length,
        officialCount: offers.filter((o) => o.isOfficial).length,
        freeShippingShare: offers.length ? offers.filter((o) => o.freeShipping).length / offers.length : null,
        premiumShare: offers.length ? offers.filter((o) => o.listingType === "gold_pro").length / offers.length : null,
        offers: offers.map((o) => ({ s: o.sellerId, p: o.price, t: o.listingType, f: o.isFull, o: o.isOfficial })),
      };
      const s = sample.find((x) => x.id === id);
      if (s) Object.assign(s, { listings: total, priceMin: snap.priceMin });
      if (!opts.dryRun) {
        await db
          .insert(mlOfferSnapshots)
          .values(snap)
          .onConflictDoUpdate({
            target: [mlOfferSnapshots.productId, mlOfferSnapshots.day],
            set: {
              listingsCount: sql`excluded.listings_count`,
              sellersCount: sql`excluded.sellers_count`,
              priceMin: sql`excluded.price_min`,
              priceMedian: sql`excluded.price_median`,
              priceMax: sql`excluded.price_max`,
              fullCount: sql`excluded.full_count`,
              officialCount: sql`excluded.official_count`,
              freeShippingShare: sql`excluded.free_shipping_share`,
              premiumShare: sql`excluded.premium_share`,
              offers: sql`excluded.offers`,
            },
          });
        // categoria real do produto (a dos anúncios é a folha, mais precisa que a do ranking)
        const leaf = offers.find((o) => o.categoryId)?.categoryId;
        if (leaf) await db.update(mlCatalogProducts).set({ categoryId: leaf }).where(and(eq(mlCatalogProducts.id, id)));
      }
      run.snapshots++;
    } catch (err) {
      if (err instanceof MlError && err.status === 401) throw err;
      run.errors.push(`produto ${id}: ${(err as Error).message}`);
    }
    if (++done % 200 === 0) log(`${done}/${ids.length} produtos`);
  });
  if (opts.dryRun) run.sample = sample;
  return run;
}
