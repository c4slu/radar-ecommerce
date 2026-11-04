import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, inventoryLots, stockMovements } from "@radar/db";

export interface StockSummary {
  balance: number;
  /** custo médio ponderado dos lotes recebidos */
  avgCost: number | null;
  stockValue: number;
  /** unidades vendidas nos últimos 30 dias */
  sold30: number;
  /** dias que o saldo atual cobre no ritmo de vendas dos últimos 30 dias */
  coverageDays: number | null;
}

/** Resumo de estoque por produto. Sem `productIds`, traz todos. */
export async function getStockSummaries(productIds?: string[]): Promise<Map<string, StockSummary>> {
  const db = getDb();
  if (productIds && productIds.length === 0) return new Map();
  const since = new Date(Date.now() - 30 * 86_400_000);

  const [balances, costs, sales] = await Promise.all([
    db
      .select({ productId: stockMovements.productId, qty: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)::int` })
      .from(stockMovements)
      .where(productIds ? inArray(stockMovements.productId, productIds) : undefined)
      .groupBy(stockMovements.productId),
    db
      .select({
        productId: inventoryLots.productId,
        avg: sql<number>`(sum(${inventoryLots.quantity} * ${inventoryLots.landedUnitCost}) / nullif(sum(${inventoryLots.quantity}), 0))::float8`,
      })
      .from(inventoryLots)
      .where(productIds ? inArray(inventoryLots.productId, productIds) : undefined)
      .groupBy(inventoryLots.productId),
    db
      .select({ productId: stockMovements.productId, qty: sql<number>`coalesce(sum(-${stockMovements.quantity}), 0)::int` })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.type, "saida"),
          gte(stockMovements.occurredAt, since),
          productIds ? inArray(stockMovements.productId, productIds) : undefined,
        ),
      )
      .groupBy(stockMovements.productId),
  ]);

  const out = new Map<string, StockSummary>();
  const get = (id: string) => {
    let s = out.get(id);
    if (!s) out.set(id, (s = { balance: 0, avgCost: null, stockValue: 0, sold30: 0, coverageDays: null }));
    return s;
  };
  for (const b of balances) get(b.productId).balance = Number(b.qty);
  for (const c of costs) get(c.productId).avgCost = c.avg == null ? null : Number(c.avg);
  for (const s of sales) get(s.productId).sold30 = Number(s.qty);
  for (const s of out.values()) {
    s.stockValue = s.avgCost != null ? s.balance * s.avgCost : 0;
    s.coverageDays = s.sold30 > 0 ? s.balance / (s.sold30 / 30) : null;
  }
  return out;
}

export const EMPTY_STOCK: StockSummary = { balance: 0, avgCost: null, stockValue: 0, sold30: 0, coverageDays: null };
