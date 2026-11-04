import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { MARKETPLACES, priceForMargin, quoteLandedCost } from "@radar/core";
import { getDb, products, supplierQuotes, suppliers } from "@radar/db";
import { ActionForm, DeleteButton } from "@/components/action-form";
import { EmptyState, Field, PageHeader, SelectField, Td, Th } from "@/components/ui";
import { getActiveFeeRules, getLatestFx, getSettings } from "@/lib/data";
import { brl, dateBr, num, pct, unitPrice } from "@/lib/format";
import { EMPTY_STOCK, getStockSummaries } from "@/lib/stock";
import { addQuote, deleteProduct, deleteQuote, saveProduct } from "../actions";
import { ProductForm } from "../product-form";
import { MarketSection } from "./market-section";

export const dynamic = "force-dynamic";

const MARKETPLACE_LABEL = { mercadolivre: "Mercado Livre", shopee: "Shopee", tiktokshop: "TikTok Shop" } as const;

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { id } = await params;
  const { aviso } = await searchParams;
  const db = getDb();
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) notFound();

  const [quoteRows, supplierList, fx, feeRules, settings, stockMap] = await Promise.all([
    db
      .select({ q: supplierQuotes, supplier: { id: suppliers.id, name: suppliers.name, leadTimeDays: suppliers.leadTimeDays } })
      .from(supplierQuotes)
      .innerJoin(suppliers, eq(suppliers.id, supplierQuotes.supplierId))
      .where(eq(supplierQuotes.productId, id))
      .orderBy(desc(supplierQuotes.quotedAt)),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(asc(suppliers.name)),
    getLatestFx(),
    getActiveFeeRules(),
    getSettings(),
    getStockSummaries([id]),
  ]);
  const stock = stockMap.get(id) ?? EMPTY_STOCK;

  const quotes = quoteRows
    .map((r) => ({ ...r, cost: quoteLandedCost({ ...r.q, fxRate: fx[r.q.currency], quantity: r.q.minQty }) }))
    .sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity));
  const best = quotes.find((q) => q.cost != null);
  // custo de referência: custo médio do estoque se houver, senão a melhor cotação
  const refCost = stock.avgCost ?? best?.cost ?? null;
  const refLabel = stock.avgCost != null ? "custo médio do estoque" : best ? `melhor cotação (${best.supplier.name})` : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        subtitle={`SKU ${product.sku}`}
        action={
          <DeleteButton
            action={deleteProduct.bind(null, id)}
            confirmText="Excluir o produto? Se ele já tiver estoque, será só marcado como descontinuado."
          />
        }
      />
      {aviso === "descontinuado" && (
        <div className="card text-sm text-amber-600">O produto tem estoque registrado, então foi marcado como descontinuado em vez de excluído.</div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label="Estoque" value={`${num(stock.balance)} un.`} />
        <Kpi label="Custo médio" value={brl(stock.avgCost)} />
        <Kpi label="Valor em estoque" value={brl(stock.stockValue)} />
        <Kpi label="Cobertura" value={stock.coverageDays == null ? "-" : `${Math.round(stock.coverageDays)} dias`} />
      </div>

      <MarketSection productId={id} cost={refCost} hasTerms={product.searchTerms.length > 0} />

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card">
          <h2 className="mb-1 font-medium">Preço por marketplace</h2>
          <p className="mb-3 text-xs text-zinc-500">
            {refCost == null
              ? "Adicione uma cotação ou um lote para calcular."
              : `Base: ${brl(refCost)} (${refLabel}), imposto ${pct(settings.taxPct)}, margem alvo ${pct(settings.targetMargin)}. Frete por sua conta não incluído.`}
          </p>
          {refCost != null && (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Marketplace</Th>
                  <Th right>Preço mínimo</Th>
                  <Th right>Preço p/ margem alvo</Th>
                </tr>
              </thead>
              <tbody>
                {MARKETPLACES.map((m) => {
                  const ctx = { marketplace: m, feeRules, categoryId: product.mlCategoryId, landedCost: refCost, taxPct: settings.taxPct };
                  const hasRules = feeRules.some((r) => r.marketplace === m);
                  return (
                    <tr key={m} className="border-t border-zinc-100 dark:border-zinc-800">
                      <Td>{MARKETPLACE_LABEL[m]}</Td>
                      {hasRules ? (
                        <>
                          <Td right>{brl(priceForMargin(0, ctx))}</Td>
                          <Td right className="font-medium">{brl(priceForMargin(settings.targetMargin, ctx))}</Td>
                        </>
                      ) : (
                        <Td right className="text-zinc-400">
                          sem tarifa cadastrada
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-zinc-500">
            Para avaliar o risco com preços de concorrentes, use a <Link href="/calculadora" className="underline">calculadora</Link>.
          </p>
        </div>

        <div className="card">
          <h2 className="mb-3 font-medium">Nova cotação</h2>
          {supplierList.length === 0 ? (
            <EmptyState>
              Cadastre um <Link href="/fornecedores/novo" className="underline">fornecedor</Link> primeiro.
            </EmptyState>
          ) : (
            <ActionForm action={addQuote.bind(null, id)} submitLabel="Adicionar cotação" resetOnSuccess>
              <div className="grid gap-3 sm:grid-cols-3">
                <SelectField
                  label="Fornecedor"
                  name="supplierId"
                  className="sm:col-span-2"
                  options={supplierList.map((s) => ({ value: s.id, label: s.name }))}
                />
                <SelectField
                  label="Moeda"
                  name="currency"
                  options={["BRL", "USD", "CNY"].map((c) => ({ value: c, label: fx[c] && c !== "BRL" ? `${c} (R$ ${num(fx[c], 4)})` : c }))}
                />
                <Field label="Preço unitário *" name="unitPrice" inputMode="decimal" required />
                <Field label="Qtd. mínima" name="minQty" inputMode="numeric" hint="Usada para ratear frete" />
                <Field label="Frete total (R$)" name="freightTotal" inputMode="decimal" />
                <Field label="Impostos/taxas (R$)" name="otherCostsTotal" inputMode="decimal" hint="Importação, DIFAL etc." />
                <Field label="Data da cotação" name="quotedAt" type="date" />
                <Field label="Válida até" name="validUntil" type="date" />
              </div>
            </ActionForm>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-3 font-medium">Cotações ({quotes.length})</h2>
        {quotes.length === 0 ? (
          <EmptyState>Nenhuma cotação ainda.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Fornecedor</Th>
                <Th right>Preço</Th>
                <Th right>Qtd. mín.</Th>
                <Th right>Frete + taxas</Th>
                <Th right>Custo final/un</Th>
                <Th right>Prazo</Th>
                <Th right>Data</Th>
                <Th right>Validade</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {quotes.map(({ q, supplier, cost }) => {
                const expired = q.validUntil != null && q.validUntil < new Date().toISOString().slice(0, 10);
                return (
                  <tr key={q.id} className={`border-t border-zinc-100 dark:border-zinc-800 ${expired ? "opacity-50" : ""}`}>
                    <Td>
                      <Link href={`/fornecedores/${supplier.id}`} className="hover:underline">
                        {supplier.name}
                      </Link>
                      {best?.q.id === q.id && <span className="ml-2 text-xs text-emerald-600">melhor</span>}
                    </Td>
                    <Td right>
                      {q.currency} {unitPrice(q.unitPrice)}
                    </Td>
                    <Td right>{num(q.minQty)}</Td>
                    <Td right>{brl((q.freightTotal ?? 0) + (q.otherCostsTotal ?? 0))}</Td>
                    <Td right className="font-medium">
                      {cost == null ? <span className="text-amber-600">sem câmbio</span> : brl(cost)}
                    </Td>
                    <Td right>{supplier.leadTimeDays != null ? `${supplier.leadTimeDays} d` : "-"}</Td>
                    <Td right>{dateBr(q.quotedAt)}</Td>
                    <Td right>{expired ? "vencida" : dateBr(q.validUntil)}</Td>
                    <Td right>
                      <DeleteButton action={deleteQuote.bind(null, id, q.id)} confirmText="Excluir esta cotação?" />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium">Dados do produto</h2>
        <ProductForm product={product} action={saveProduct.bind(null, id)} />
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
