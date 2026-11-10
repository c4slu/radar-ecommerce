import { eq } from "drizzle-orm";
import { quoteLandedCost } from "@radar/core";
import { getDb, products, supplierQuotes } from "@radar/db";
import { DEFAULT_FEES, loadCalcProduct, loadFees, parseCatalogId, type CalcFees, type CalcProduct } from "@/lib/calculator-data";
import { getLatestFx, getSettings } from "@/lib/data";
import { getStockSummaries } from "@/lib/stock";
import { ProfitCalculator } from "./profit-calculator";

export const dynamic = "force-dynamic";

/** Custo de referência de um produto do Radar: custo médio do estoque, senão a melhor cotação. */
async function radarCost(id: string): Promise<{ name: string; cost: number | null } | null> {
  const db = getDb();
  const [p] = await db.select({ name: products.name }).from(products).where(eq(products.id, id));
  if (!p) return null;
  const [stock, quotes, fx] = await Promise.all([getStockSummaries([id]), db.select().from(supplierQuotes).where(eq(supplierQuotes.productId, id)), getLatestFx()]);
  const best = quotes
    .map((q) => quoteLandedCost({ ...q, fxRate: fx[q.currency], quantity: q.minQty }))
    .filter((c): c is number => c != null)
    .sort((a, b) => a - b)[0];
  return { name: p.name, cost: stock.get(id)?.avgCost ?? best ?? null };
}

export default async function CalculadoraPage({ searchParams }: { searchParams: Promise<{ produto?: string; radar?: string; custo?: string }> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  let product: CalcProduct | null = null;
  let fees: CalcFees = DEFAULT_FEES;
  let loadError: string | null = null;
  const catalogId = sp.produto ? parseCatalogId(sp.produto) : null;
  if (catalogId) {
    try {
      product = await loadCalcProduct(catalogId);
      fees = await loadFees(product.priceMedian ?? product.priceMin ?? 0, product.categoryId);
    } catch (err) {
      loadError = (err as Error).message;
    }
  }
  const radar = sp.radar ? await radarCost(sp.radar).catch(() => null) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Calculadora de lucro</h1>
        <p className="text-sm text-zinc-500">
          Quanto sobra por unidade vendida no Mercado Livre, e o risco do lote que você pretende comprar.
          {radar && <> Custo carregado de <strong>{radar.name}</strong>.</>}
        </p>
      </div>
      <ProfitCalculator
        initialProduct={product}
        initialFees={fees}
        initialCost={radar?.cost ?? (sp.custo ? Number(sp.custo) : null)}
        loadError={loadError}
        settings={{ expectedShare: settings.expectedShare, targetMargin: settings.targetMargin, maxDaysToSell: settings.maxDaysToSell, coverageDays: settings.coverageDays }}
      />
    </div>
  );
}
