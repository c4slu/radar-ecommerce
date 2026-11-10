import { desc } from "drizzle-orm";
import { Store } from "lucide-react";
import { getDb, supplierFeeds } from "@radar/db";
import { ActionForm, DeleteButton } from "@/components/action-form";
import { Badge, CardTitle, EmptyState, Field } from "@/components/ui";
import { addFeed, deleteFeed, syncFeedNow } from "./actions";

/** Catálogos (XML/CSV) de fornecedores nacionais: base do custo automático em reais. */
export async function FeedsCard() {
  const feeds = await getDb()
    .select()
    .from(supplierFeeds)
    .orderBy(desc(supplierFeeds.createdAt))
    .catch(() => null);

  return (
    <section className="card space-y-4" aria-labelledby="catalogos-titulo">
      <CardTitle subtitle="Link do catálogo XML/CSV que o atacadista ou a plataforma de dropshipping fornece para lojas virtuais">
        <span id="catalogos-titulo" className="flex items-center gap-2">
          <Store className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden /> Fornecedores nacionais
        </span>
      </CardTitle>

      {feeds == null ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          As tabelas de catálogos ainda não existem neste banco. Rode <code>npm run db:setup</code>.
        </p>
      ) : feeds.length === 0 ? (
        <EmptyState icon={Store}>Nenhum catálogo cadastrado. Peça ao fornecedor o link do catálogo XML ou CSV e cadastre abaixo.</EmptyState>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {feeds.map((f) => (
            <li key={f.id} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{f.name}</span>
                  {f.lastError ? (
                    <Badge tone="red">com erro</Badge>
                  ) : f.itemCount ? (
                    <Badge tone="green">{f.itemCount.toLocaleString("pt-BR")} produtos</Badge>
                  ) : (
                    <Badge>não sincronizado</Badge>
                  )}
                </div>
                <div className="muted truncate text-xs">{f.url}</div>
                <div className="muted text-xs">
                  {f.lastSyncAt
                    ? `Atualizado em ${f.lastSyncAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                    : "Nunca sincronizado"}
                </div>
                {f.lastError && <p className="mt-1 text-xs text-red-700 dark:text-red-400">{f.lastError}</p>}
              </div>
              <div className="flex items-center gap-1">
                <ActionForm action={syncFeedNow.bind(null, f.id)} submitLabel="Sincronizar" variant="secondary" className="flex flex-wrap items-center gap-2">
                  {null}
                </ActionForm>
                <DeleteButton action={deleteFeed.bind(null, f.id)} label="Remover" confirmText={`Remover o catálogo de ${f.name} e os produtos dele?`} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <ActionForm action={addFeed} submitLabel="Adicionar e importar" resetOnSuccess>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <Field label="Fornecedor" name="name" placeholder="Atacado Exemplo" required />
          <Field label="Link do catálogo (XML ou CSV)" name="url" type="url" placeholder="https://fornecedor.com.br/catalogo.xml" required />
        </div>
      </ActionForm>
      <p className="muted text-xs">
        Formatos aceitos: XML do Google Merchant, XML de produtos (nome/preço/estoque) e CSV. Os catálogos são atualizados todo dia; se trouxerem marca e
        modelo, o vínculo com o produto do Mercado Livre é exato.
      </p>
    </section>
  );
}
