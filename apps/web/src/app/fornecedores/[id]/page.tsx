import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { quoteLandedCost } from "@radar/core";
import { getDb, products, supplierQuotes, suppliers } from "@radar/db";
import { DeleteButton } from "@/components/action-form";
import { EmptyState, PageHeader, Td, Th } from "@/components/ui";
import { getLatestFx } from "@/lib/data";
import { brl, dateBr, num, unitPrice } from "@/lib/format";
import { deleteSupplier, saveSupplier } from "../actions";
import { SupplierForm } from "../supplier-form";

export const dynamic = "force-dynamic";

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (!supplier) notFound();
  const [quotes, fx] = await Promise.all([
    db
      .select({ q: supplierQuotes, product: { id: products.id, name: products.name, sku: products.sku } })
      .from(supplierQuotes)
      .innerJoin(products, eq(products.id, supplierQuotes.productId))
      .where(eq(supplierQuotes.supplierId, id))
      .orderBy(desc(supplierQuotes.quotedAt)),
    getLatestFx(),
  ]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,640px)_1fr]">
      <div>
        <PageHeader
          title={supplier.name}
          action={<DeleteButton action={deleteSupplier.bind(null, id)} confirmText="Excluir o fornecedor e todas as cotações dele?" />}
        />
        <div className="card">
          <SupplierForm supplier={supplier} action={saveSupplier.bind(null, id)} />
        </div>
      </div>
      <div className="card h-fit">
        <h2 className="mb-3 font-medium">Cotações deste fornecedor</h2>
        {quotes.length === 0 ? (
          <EmptyState>
            Nenhuma cotação. Adicione pela página de um <Link href="/produtos" className="underline">produto</Link>.
          </EmptyState>
        ) : (
          <table className="table-rows w-full text-sm">
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th right>Preço</Th>
                <Th right>Mín.</Th>
                <Th right>Custo final</Th>
                <Th right>Data</Th>
              </tr>
            </thead>
            <tbody>
              {quotes.map(({ q, product }) => (
                <tr key={q.id} className="border-t border-[var(--border)]">
                  <Td>
                    <Link href={`/produtos/${product.id}`} className="hover:underline">
                      {product.name}
                    </Link>
                  </Td>
                  <Td right>
                    {q.currency} {unitPrice(q.unitPrice)}
                  </Td>
                  <Td right>{num(q.minQty)}</Td>
                  <Td right>
                    {brl(
                      quoteLandedCost({
                        unitPrice: q.unitPrice,
                        currency: q.currency,
                        fxRate: fx[q.currency],
                        quantity: q.minQty,
                        freightTotal: q.freightTotal,
                        otherCostsTotal: q.otherCostsTotal,
                      }),
                    )}
                  </Td>
                  <Td right>{dateBr(q.quotedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
