import { asc, desc } from "drizzle-orm";
import { fxRates, getDb, marketplaceFees } from "@radar/db";
import { ActionForm, DeleteButton } from "@/components/action-form";
import { Badge, EmptyState, Field, PageHeader, SelectField, Td, Th } from "@/components/ui";
import { getSettings } from "@/lib/data";
import { brl, dateBr, num, pct } from "@/lib/format";
import { addFee, deleteFee, saveSettings } from "./actions";
import { MlCard } from "./ml-card";

export const dynamic = "force-dynamic";

const pctInput = (v: number) => String(Math.round(v * 10000) / 100).replace(".", ",");

const INTEGRATIONS = [
  { name: "Supabase (login)", vars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "ALLOWED_EMAIL"], phase: "ativo" },
  { name: "Banco de dados", vars: ["DATABASE_URL"], phase: "ativo" },
  { name: "Telegram (alertas)", vars: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"], phase: "fase 3" },
  { name: "Mercado Livre (app)", vars: ["ML_CLIENT_ID", "ML_CLIENT_SECRET"], phase: "busca bloqueada pelo ML" },
  { name: "Shopee (afiliados)", vars: ["SHOPEE_APP_ID", "SHOPEE_APP_SECRET"], phase: "preços e vendas" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ml?: string; detalhe?: string }> }) {
  const { ml, detalhe } = await searchParams;
  const db = getDb();
  const [s, fees, fx] = await Promise.all([
    getSettings(),
    db.select().from(marketplaceFees).orderBy(asc(marketplaceFees.marketplace), asc(marketplaceFees.minPrice)),
    db.select().from(fxRates).orderBy(desc(fxRates.day)).limit(6),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" subtitle="Parâmetros usados nos cálculos de margem e risco." />

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-medium">Parâmetros</h2>
          <ActionForm action={saveSettings}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Imposto sobre a venda (%)" name="taxPct" defaultValue={pctInput(s.taxPct)} inputMode="decimal" hint="Alíquota do Simples/MEI etc." />
              <Field label="Margem líquida alvo (%)" name="targetMargin" defaultValue={pctInput(s.targetMargin)} inputMode="decimal" />
              <Field
                label="Fatia do mercado esperada (%)"
                name="expectedShare"
                defaultValue={pctInput(s.expectedShare)}
                inputMode="decimal"
                hint="Quanto das vendas do mercado você espera pegar"
              />
              <Field label="Dias de cobertura do lote" name="coverageDays" defaultValue={s.coverageDays} inputMode="numeric" hint="Base do lote recomendado" />
              <Field
                label="Prazo máximo para vender um lote (dias)"
                name="maxDaysToSell"
                defaultValue={s.maxDaysToSell}
                inputMode="numeric"
                hint="Acima disso o giro conta como risco máximo"
              />
            </div>
          </ActionForm>
        </div>

        <div className="space-y-6">
          <MlCard status={ml} detail={detalhe} />
          <div className="card">
            <h2 className="mb-3 font-medium">Integrações (.env)</h2>
            <table className="w-full text-sm">
              <tbody>
                {INTEGRATIONS.map((i) => {
                  const missing = i.vars.filter((v) => !process.env[v]);
                  return (
                    <tr key={i.name} className="border-t border-zinc-100 first:border-0 dark:border-zinc-800">
                      <Td>{i.name}</Td>
                      <Td>{missing.length === 0 ? <Badge tone="green">configurado</Badge> : <Badge tone="red">falta {missing.join(", ")}</Badge>}</Td>
                      <Td right className="text-xs text-zinc-500">
                        {i.phase}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2 className="mb-3 font-medium">Câmbio (últimas coletas)</h2>
            {fx.length === 0 ? (
              <EmptyState>Nenhuma cotação. Rode o job collect-fx.</EmptyState>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {fx.map((r) => (
                    <tr key={r.id} className="border-t border-zinc-100 first:border-0 dark:border-zinc-800">
                      <Td>{r.pair}</Td>
                      <Td right>R$ {num(r.rate, 4)}</Td>
                      <Td right className="text-zinc-500">
                        {dateBr(r.day)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-1 font-medium">Tarifas dos marketplaces</h2>
        <p className="mb-3 text-xs text-zinc-500">
          As taxas mudam com frequência: confira na central de vendedor de cada marketplace. Regras com categoria têm prioridade sobre as gerais
          na mesma faixa de preço.
        </p>
        {fees.length === 0 ? (
          <EmptyState>Nenhuma tarifa cadastrada.</EmptyState>
        ) : (
          <table className="mb-6 w-full text-sm">
            <thead>
              <tr>
                <Th>Marketplace</Th>
                <Th>Descrição</Th>
                <Th>Categoria</Th>
                <Th right>Comissão</Th>
                <Th right>Tarifa fixa</Th>
                <Th right>Faixa de preço</Th>
                <Th right>Vigência</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {fees.map((f) => (
                <tr key={f.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <Td>{f.marketplace}</Td>
                  <Td>{f.label ?? "-"}</Td>
                  <Td>{f.categoryId ?? "todas"}</Td>
                  <Td right>{pct(f.commissionPct, 2)}</Td>
                  <Td right>{brl(f.fixedFee)}</Td>
                  <Td right>
                    {f.minPrice != null ? brl(f.minPrice) : "R$ 0"} a {f.maxPrice != null ? brl(f.maxPrice) : "sem limite"}
                  </Td>
                  <Td right className="text-zinc-500">
                    {dateBr(f.validFrom)}
                    {f.validTo && ` a ${dateBr(f.validTo)}`}
                  </Td>
                  <Td right>
                    <DeleteButton action={deleteFee.bind(null, f.id)} confirmText="Excluir esta tarifa?" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3 className="mb-3 text-sm font-medium">Adicionar tarifa</h3>
        <ActionForm action={addFee} submitLabel="Adicionar" resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-4">
            <SelectField
              label="Marketplace"
              name="marketplace"
              options={[
                { value: "mercadolivre", label: "Mercado Livre" },
                { value: "shopee", label: "Shopee" },
                { value: "tiktokshop", label: "TikTok Shop" },
              ]}
            />
            <Field label="Descrição" name="label" placeholder="ML Premium" />
            <Field label="Categoria (opcional)" name="categoryId" placeholder="MLB1234" />
            <Field label="Comissão (%) *" name="commissionPct" inputMode="decimal" required />
            <Field label="Tarifa fixa (R$)" name="fixedFee" inputMode="decimal" />
            <Field label="Preço mínimo (R$)" name="minPrice" inputMode="decimal" />
            <Field label="Preço máximo (R$)" name="maxPrice" inputMode="decimal" hint="Vazio = sem limite" />
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
