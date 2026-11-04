import Link from "next/link";
import { asc } from "drizzle-orm";
import { quoteLandedCost } from "@radar/core";
import { getDb, products, supplierQuotes } from "@radar/db";
import { Badge, EmptyState, LinkButton, PageHeader, STATUS_TONE, Td, Th } from "@/components/ui";
import { getLatestFx } from "@/lib/data";
import { brl, num } from "@/lib/format";
import { EMPTY_STOCK, getStockSummaries } from "@/lib/stock";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const db = getDb();
  const [rows, quotes, fx, stock] = await Promise.all([
    db.select().from(products).orderBy(asc(products.name)),
    db.select().from(supplierQuotes),
    getLatestFx(),
    getStockSummaries(),
  ]);

  // menor custo final entre as cotações de cada produto
  const bestCost = new Map<string, number>();
  for (const q of quotes) {
    const c = quoteLandedCost({ ...q, fxRate: fx[q.currency], quantity: q.minQty });
    if (c != null && c < (bestCost.get(q.productId) ?? Infinity)) bestCost.set(q.productId, c);
  }

  return (
    <>
      <PageHeader
        title="Produtos"
        subtitle="Do produto em pesquisa até o que está vendendo."
        action={<LinkButton href="/produtos/novo">Novo produto</LinkButton>}
      />
      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? (
          <EmptyState>Nenhum produto ainda.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <Th>SKU</Th>
                <Th>Nome</Th>
                <Th>Status</Th>
                <Th>Categoria</Th>
                <Th right>Melhor custo</Th>
                <Th right>Estoque</Th>
                <Th right>Vendidos 30d</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const s = stock.get(p.id) ?? EMPTY_STOCK;
                return (
                  <tr key={p.id} className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50">
                    <Td className="font-mono text-xs">{p.sku}</Td>
                    <Td>
                      <Link href={`/produtos/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                    </Td>
                    <Td className="text-zinc-500">{p.category ?? "-"}</Td>
                    <Td right>{brl(bestCost.get(p.id))}</Td>
                    <Td right>{num(s.balance)}</Td>
                    <Td right>{num(s.sold30)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
