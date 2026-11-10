import { Truck } from "lucide-react";
import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { getDb, supplierQuotes, suppliers } from "@radar/db";
import { Badge, EmptyState, LinkButton, PageHeader, Td, Th } from "@/components/ui";
import { brl, formatCnpj } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const db = getDb();
  const rows = await db
    .select({ s: suppliers, quotes: count(supplierQuotes.id) })
    .from(suppliers)
    .leftJoin(supplierQuotes, eq(supplierQuotes.supplierId, suppliers.id))
    .groupBy(suppliers.id)
    .orderBy(asc(suppliers.name));

  return (
    <>
      <PageHeader
        icon={Truck} title="Fornecedores"
        subtitle="Cadastre quem vende para você e compare as cotações por produto."
        action={<LinkButton href="/fornecedores/novo">Novo fornecedor</LinkButton>}
      />
      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? (
          <EmptyState>Nenhum fornecedor ainda.</EmptyState>
        ) : (
          <table className="table-rows w-full text-sm">
            <thead className="border-b border-[var(--border)]">
              <tr>
                <Th>Nome</Th>
                <Th>CNPJ</Th>
                <Th>Canal</Th>
                <Th>Local</Th>
                <Th right>Prazo</Th>
                <Th right>Pedido mín.</Th>
                <Th right>Nota</Th>
                <Th right>Cotações</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, quotes }) => (
                <tr key={s.id} className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50">
                  <Td>
                    <Link href={`/fornecedores/${s.id}`} className="row-link font-medium">
                      {s.name}
                    </Link>
                  </Td>
                  <Td className="text-zinc-500">{formatCnpj(s.cnpj) || "-"}</Td>
                  <Td>
                    <Badge tone={s.channel === "importacao" ? "blue" : "zinc"}>{s.channel === "importacao" ? "importação" : "nacional"}</Badge>
                  </Td>
                  <Td className="text-zinc-500">{[s.city, s.state].filter(Boolean).join("/") || "-"}</Td>
                  <Td right>{s.leadTimeDays != null ? `${s.leadTimeDays} d` : "-"}</Td>
                  <Td right>{brl(s.minOrderValue)}</Td>
                  <Td right>{s.rating ? "★".repeat(s.rating) : "-"}</Td>
                  <Td right>{quotes}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
