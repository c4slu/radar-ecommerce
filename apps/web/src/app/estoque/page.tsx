import { Boxes } from "lucide-react";
import Link from "next/link";
import { asc, desc, eq, ne } from "drizzle-orm";
import { getDb, products, stockMovements, suppliers } from "@radar/db";
import { ActionForm, DeleteButton } from "@/components/action-form";
import { Badge, EmptyState, Field, MARKETPLACE_LABEL, MOVEMENT_LABEL, PageHeader, SelectField, Td, Th } from "@/components/ui";
import { brl, dateBr, num } from "@/lib/format";
import { EMPTY_STOCK, getStockSummaries } from "@/lib/stock";
import { addLot, addMovement, deleteMovement } from "./actions";

export const dynamic = "force-dynamic";

/** Abaixo disso, o estoque é sinalizado para reposição. */
const LOW_COVERAGE_DAYS = 15;

const TYPE_TONE = { entrada: "green", saida: "blue", ajuste: "amber" } as const;

export default async function StockPage() {
  const db = getDb();
  const [productList, supplierList, stock, movements] = await Promise.all([
    db
      .select({ id: products.id, name: products.name, sku: products.sku, status: products.status })
      .from(products)
      .where(ne(products.status, "descontinuado"))
      .orderBy(asc(products.name)),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(asc(suppliers.name)),
    getStockSummaries(),
    db
      .select({ m: stockMovements, product: { id: products.id, name: products.name } })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .orderBy(desc(stockMovements.occurredAt))
      .limit(50),
  ]);

  const rows = productList.map((p) => ({ ...p, s: stock.get(p.id) ?? EMPTY_STOCK }));
  const totalValue = rows.reduce((a, r) => a + r.s.stockValue, 0);
  const totalUnits = rows.reduce((a, r) => a + r.s.balance, 0);
  const productOptions = productList.map((p) => ({ value: p.id, label: `${p.name} (${p.sku})` }));

  return (
    <div className="space-y-6">
      <PageHeader icon={Boxes} title="Estoque" subtitle={`${num(totalUnits)} unidades · ${brl(totalValue)} em estoque (a custo)`} />

      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? (
          <EmptyState>
            Cadastre um <Link href="/produtos/novo" className="underline">produto</Link> para controlar o estoque.
          </EmptyState>
        ) : (
          <table className="table-rows w-full text-sm">
            <thead className="border-b border-[var(--border)]">
              <tr>
                <Th>Produto</Th>
                <Th right>Saldo</Th>
                <Th right>Custo médio</Th>
                <Th right>Valor</Th>
                <Th right>Vendidos 30d</Th>
                <Th right>Cobertura</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ id, name, sku, s }) => {
                const low = s.coverageDays != null && s.coverageDays < LOW_COVERAGE_DAYS;
                return (
                  <tr key={id} className="border-t border-[var(--border)]">
                    <Td>
                      <Link href={`/produtos/${id}`} className="row-link font-medium">
                        {name}
                      </Link>{" "}
                      <span className="font-mono text-xs text-zinc-400">{sku}</span>
                    </Td>
                    <Td right className={s.balance < 0 ? "text-red-600" : ""}>{num(s.balance)}</Td>
                    <Td right>{brl(s.avgCost)}</Td>
                    <Td right>{brl(s.stockValue)}</Td>
                    <Td right>{num(s.sold30)}</Td>
                    <Td right>
                      {s.coverageDays == null ? (
                        "-"
                      ) : (
                        <span className={low ? "font-medium text-red-600" : ""}>
                          {Math.round(s.coverageDays)} dias{low && " · repor"}
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {productOptions.length > 0 && (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="card">
            <h2 className="mb-3 font-medium">Entrada de lote</h2>
            <ActionForm action={addLot} submitLabel="Registrar entrada" resetOnSuccess>
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField label="Produto" name="productId" className="sm:col-span-2" options={productOptions} />
                <SelectField
                  label="Fornecedor"
                  name="supplierId"
                  options={[{ value: "", label: "-" }, ...supplierList.map((s) => ({ value: s.id, label: s.name }))]}
                />
                <Field label="Recebido em" name="receivedAt" type="date" />
                <Field label="Quantidade *" name="quantity" inputMode="numeric" required />
                <Field
                  label="Custo final por unidade (R$) *"
                  name="landedUnitCost"
                  inputMode="decimal"
                  required
                  hint="Produto + frete + impostos, dividido pela quantidade"
                />
              </div>
            </ActionForm>
          </div>

          <div className="card">
            <h2 className="mb-3 font-medium">Saída ou ajuste</h2>
            <ActionForm action={addMovement} submitLabel="Registrar" resetOnSuccess>
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField label="Produto" name="productId" className="sm:col-span-2" options={productOptions} />
                <SelectField
                  label="Tipo"
                  name="type"
                  options={[
                    { value: "saida", label: "Saída (venda)" },
                    { value: "ajuste", label: "Ajuste (+/-)" },
                  ]}
                />
                <SelectField
                  label="Canal (na venda)"
                  name="marketplace"
                  options={[
                    { value: "", label: "-" },
                    { value: "mercadolivre", label: "Mercado Livre" },
                    { value: "shopee", label: "Shopee" },
                    { value: "tiktokshop", label: "TikTok Shop" },
                  ]}
                />
                <Field label="Quantidade *" name="quantity" inputMode="numeric" required hint="No ajuste, use negativo para baixar (perda, avaria)" />
                <Field label="Preço de venda unitário (R$)" name="unitPrice" inputMode="decimal" />
                <Field label="Data" name="occurredAt" type="date" />
              </div>
            </ActionForm>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <h2 className="mb-3 font-medium">Últimas movimentações</h2>
        {movements.length === 0 ? (
          <EmptyState>Nenhuma movimentação ainda.</EmptyState>
        ) : (
          <table className="table-rows w-full text-sm">
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Produto</Th>
                <Th>Tipo</Th>
                <Th>Canal</Th>
                <Th right>Qtd.</Th>
                <Th right>Preço/un</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {movements.map(({ m, product }) => (
                <tr key={m.id} className="border-t border-[var(--border)]">
                  <Td>{dateBr(m.occurredAt)}</Td>
                  <Td>{product.name}</Td>
                  <Td>
                    <Badge tone={TYPE_TONE[m.type]}>{MOVEMENT_LABEL[m.type]}</Badge>
                  </Td>
                  <Td className="text-zinc-500">{m.marketplace ? MARKETPLACE_LABEL[m.marketplace] : "-"}</Td>
                  <Td right className={m.quantity < 0 ? "text-red-600" : "text-emerald-600"}>
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </Td>
                  <Td right>{brl(m.unitPrice)}</Td>
                  <Td right>
                    <DeleteButton
                      action={deleteMovement.bind(null, m.id)}
                      confirmText={m.type === "entrada" ? "Excluir esta entrada e o lote correspondente?" : "Excluir esta movimentação?"}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
