import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { titleTokens } from "@radar/core";
import { getDb, supplierFeedItems, supplierFeeds } from "@radar/db";
import { parseFeed, type FeedItem } from "./feed";
import { SupplierError, type SearchOptions, type SupplierAdapter, type SupplierOffer } from "./types";

/**
 * Fornecedores nacionais por catálogo (XML/CSV para loja virtual). O usuário cadastra a URL do
 * catálogo em Configurações; a sincronização baixa, lê e guarda os itens em supplier_feed_items,
 * e a busca acontece no banco (rápida e sem depender do fornecedor estar no ar).
 */

const MAX_BYTES = 60 * 1024 * 1024;

/** Texto de busca: título + marca + modelo, normalizados como nos títulos do ML. */
export const searchText = (i: Pick<FeedItem, "title" | "brand" | "model">) => titleTokens([i.title, i.brand, i.model].filter(Boolean).join(" ")).join(" ");

/** Modelo normalizado para comparação exata ("TX-500" = "tx 500" = "TX500"). */
export const normModel = (m: string | null | undefined) => (m ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function download(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "radar-app/0.1 (catálogo de fornecedor)", Accept: "application/xml,text/xml,text/csv,*/*" },
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    throw new SupplierError(`não foi possível baixar o catálogo: ${(err as Error).message}`, "nacional");
  }
  if (!res.ok) throw new SupplierError(`o fornecedor respondeu HTTP ${res.status} ao baixar o catálogo`, "nacional", res.status);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new SupplierError("catálogo maior que 60 MB", "nacional");
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw new SupplierError("catálogo maior que 60 MB", "nacional");
  // catálogos antigos vêm em ISO-8859-1: se o UTF-8 gerar caracteres inválidos, tenta latin1
  const utf8 = new TextDecoder("utf-8").decode(buf);
  return utf8.includes("�") ? new TextDecoder("latin1").decode(buf) : utf8;
}

export interface SyncResult {
  feedId: string;
  name: string;
  items: number;
  removed: number;
  error?: string;
}

/** Baixa e grava um catálogo. Itens que sumiram do catálogo são removidos. */
export async function syncFeed(feedId: string, opts: { text?: string } = {}): Promise<SyncResult> {
  const db = getDb();
  const [feed] = await db.select().from(supplierFeeds).where(eq(supplierFeeds.id, feedId));
  if (!feed) throw new Error("catálogo não encontrado");
  const started = new Date();
  try {
    const items = parseFeed(opts.text ?? (await download(feed.url)));
    if (!items.length) throw new SupplierError("nenhum produto reconhecido no catálogo (formato XML do Google, XML de produtos ou CSV)", "nacional");
    // dedupe por id (alguns catálogos repetem o item por variação)
    const byId = new Map(items.map((i) => [i.externalId, i]));
    const rows = [...byId.values()].map((i) => ({
      feedId,
      externalId: i.externalId.slice(0, 200),
      title: i.title.slice(0, 500),
      price: i.price,
      salePrice: i.salePrice,
      stock: i.stock,
      available: i.available,
      imageUrl: i.imageUrl,
      url: i.url,
      brand: i.brand,
      model: i.model,
      gtin: i.gtin,
      searchText: searchText(i),
      updatedAt: started,
    }));
    for (let k = 0; k < rows.length; k += 500) {
      await db
        .insert(supplierFeedItems)
        .values(rows.slice(k, k + 500))
        .onConflictDoUpdate({
          target: [supplierFeedItems.feedId, supplierFeedItems.externalId],
          set: {
            title: sql`excluded.title`,
            price: sql`excluded.price`,
            salePrice: sql`excluded.sale_price`,
            stock: sql`excluded.stock`,
            available: sql`excluded.available`,
            imageUrl: sql`excluded.image_url`,
            url: sql`excluded.url`,
            brand: sql`excluded.brand`,
            model: sql`excluded.model`,
            gtin: sql`excluded.gtin`,
            searchText: sql`excluded.search_text`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
    const removed = await db
      .delete(supplierFeedItems)
      .where(and(eq(supplierFeedItems.feedId, feedId), lt(supplierFeedItems.updatedAt, started)))
      .returning({ id: supplierFeedItems.id });
    await db.update(supplierFeeds).set({ lastSyncAt: started, itemCount: rows.length, lastError: null }).where(eq(supplierFeeds.id, feedId));
    return { feedId, name: feed.name, items: rows.length, removed: removed.length };
  } catch (err) {
    const msg = (err as Error).message;
    await db.update(supplierFeeds).set({ lastError: msg.slice(0, 500) }).where(eq(supplierFeeds.id, feedId));
    return { feedId, name: feed.name, items: 0, removed: 0, error: msg };
  }
}

export async function syncAllFeeds(): Promise<SyncResult[]> {
  const feeds = await getDb().select({ id: supplierFeeds.id }).from(supplierFeeds).where(eq(supplierFeeds.enabled, true));
  const out: SyncResult[] = [];
  for (const f of feeds) out.push(await syncFeed(f.id));
  return out;
}

// ---------- Busca ----------

type ItemRow = typeof supplierFeedItems.$inferSelect & { feedName: string };

function toOffer(r: ItemRow, exact: boolean): SupplierOffer {
  return {
    source: `nacional:${r.feedId}`,
    sourceName: r.feedName,
    externalId: r.externalId,
    title: r.title,
    imageUrl: r.imageUrl,
    url: r.url,
    unitPrice: r.salePrice ?? r.price,
    priceMax: null,
    currency: "BRL",
    shipFrom: "BR",
    shippingPerUnit: null,
    shippingDays: null,
    stock: r.stock,
    moq: null,
    exact,
  };
}

export const nationalAdapter: SupplierAdapter = {
  id: "nacional",
  name: "Fornecedores nacionais",
  async configured() {
    const [r] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(supplierFeeds)
      .where(and(eq(supplierFeeds.enabled, true), sql`${supplierFeeds.itemCount} > 0`));
    return (r?.n ?? 0) > 0;
  },
  async search(query: string, opts: SearchOptions = {}) {
    const db = getDb();
    const feeds = await db.select({ id: supplierFeeds.id, name: supplierFeeds.name }).from(supplierFeeds).where(eq(supplierFeeds.enabled, true));
    if (!feeds.length) return [];
    const feedIds = feeds.map((f) => f.id);
    const names = new Map(feeds.map((f) => [f.id, f.name]));
    const withName = (rows: (typeof supplierFeedItems.$inferSelect)[]) => rows.map((r) => ({ ...r, feedName: names.get(r.feedId) ?? "Fornecedor" }));
    const limit = Math.min(opts.limit ?? 20, 50);
    const offers: SupplierOffer[] = [];

    // 1) vínculo exato por marca + modelo (catálogo do ML traz os dois)
    const model = normModel(opts.model);
    if (model.length >= 3) {
      const exact = await db
        .select()
        .from(supplierFeedItems)
        .where(
          and(
            inArray(supplierFeedItems.feedId, feedIds),
            eq(supplierFeedItems.available, true),
            sql`regexp_replace(lower(coalesce(${supplierFeedItems.model}, '')), '[^a-z0-9]', '', 'g') = ${model}`,
          ),
        )
        .limit(10);
      const brand = (opts.brand ?? "").toLowerCase();
      for (const r of withName(exact)) if (!brand || !r.brand || r.brand.toLowerCase().includes(brand)) offers.push(toOffer(r, true));
    }

    // 2) pelo nome: todas as palavras significativas (até 4) presentes; se não houver nada, basta metade
    const words = titleTokens(query).filter((t) => t.length > 2).slice(0, 4);
    if (words.length) {
      const like = (w: string) => sql`${supplierFeedItems.searchText} like ${"%" + w + "%"}`;
      const base = and(inArray(supplierFeedItems.feedId, feedIds), eq(supplierFeedItems.available, true));
      let rows = await db
        .select()
        .from(supplierFeedItems)
        .where(and(base, ...words.map(like)))
        .limit(limit);
      if (!rows.length && words.length > 1) {
        const need = Math.ceil(words.length / 2);
        const hits = sql.join(words.map((w) => sql`(case when ${like(w)} then 1 else 0 end)`), sql` + `);
        rows = await db
          .select()
          .from(supplierFeedItems)
          .where(and(base, sql`(${hits}) >= ${need}`))
          .limit(limit);
      }
      const seen = new Set(offers.map((o) => o.externalId));
      for (const r of withName(rows)) if (!seen.has(r.externalId)) offers.push(toOffer(r, false));
    }
    return offers;
  },
};
