"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, ExternalLink, Loader2, PackageSearch, Search } from "lucide-react";
import type { RankedOffer } from "@radar/suppliers";
import { confirmSupplierOffer, searchSupplierOffers, type SupplierSearchResult } from "./actions";

const brl = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "-" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const money = (v: number, cur: string) => v.toLocaleString("pt-BR", { style: "currency", currency: cur === "BRL" ? "BRL" : cur });

const COST_NOTE = {
  importado: "Importado: fora do custo (você compra só de fornecedor nacional)",
  sem_cambio: "Sem câmbio desta moeda coletado",
  preco_invalido: "Preço indisponível",
} as const;

/**
 * Painel "Fornecedores" da calculadora: busca o produto nos fornecedores configurados e
 * aplica o custo de uma oferta com um clique.
 */
export function SupplierPanel({
  title,
  brand,
  model,
  catalogId,
  confirmedId,
  onUseCost,
  onAction,
  actionLabel,
}: {
  title: string;
  brand?: string | null;
  model?: string | null;
  catalogId: string | null;
  /** externalId da oferta já confirmada para este produto */
  confirmedId: string | null;
  onUseCost?: (cost: number, offer: RankedOffer) => void;
  /** ação alternativa por oferta (ex.: adicionar como cotação de um produto do Radar) */
  onAction?: (offer: RankedOffer) => Promise<string | void>;
  actionLabel?: string;
}) {
  const [done, setDone] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SupplierSearchResult | null>(null);
  const [confirmed, setConfirmed] = useState(confirmedId);
  const [pending, start] = useTransition();

  const search = (q?: string) =>
    start(async () => {
      const r = await searchSupplierOffers(title, catalogId, q, { brand, model });
      setResult(r);
      if (!q) setQuery(r.query);
    });

  const confirm = (o: RankedOffer) =>
    start(async () => {
      if (!catalogId) return;
      await confirmSupplierOffer(catalogId, o, result?.query ?? null);
      setConfirmed(o.externalId);
      if (o.landedCost != null) onUseCost?.(o.landedCost, o);
    });

  const national = result?.offers.filter((o) => o.landedCost != null).length ?? 0;

  return (
    <section className="card space-y-3" aria-labelledby="fornecedores-titulo">
      <div className="flex items-center justify-between gap-2">
        <h2 id="fornecedores-titulo" className="flex items-center gap-2 font-semibold">
          <PackageSearch className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden /> Fornecedores
        </h2>
        {!result && (
          <button type="button" className="btn-secondary" onClick={() => search()} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
            Buscar custo
          </button>
        )}
      </div>

      {!result && <p className="muted text-sm">Procura este produto nos fornecedores integrados e mostra o custo final por unidade.</p>}

      {result && !result.configured && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Nenhum fornecedor configurado. Crie uma conta na CJ Dropshipping, gere a API key e defina <code>CJ_API_KEY</code> no .env.
        </p>
      )}

      {result?.configured && (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              search(query);
            }}
          >
            <label className="sr-only" htmlFor="termo-fornecedor">
              Termo de busca no fornecedor
            </label>
            <input id="termo-fornecedor" value={query} onChange={(e) => setQuery(e.target.value)} className="input" />
            <button className="btn-secondary shrink-0" disabled={pending || !query.trim()}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
              <span className="sr-only sm:not-sr-only">Buscar</span>
            </button>
          </form>
          <p className="muted text-xs">
            {result.searched.join(", ")} · {result.offers.length} candidatos, {national} nacionais. O catálogo da CJ é em inglês: se não achar, pesquise em
            inglês (ex.: <em>thermal bottle 500ml</em>).
          </p>
          {result.errors.map((e) => (
            <p key={e.source} className="text-xs text-red-700 dark:text-red-400">
              {e.source}: {e.message}
            </p>
          ))}

          {result.offers.length === 0 ? (
            <p className="muted py-4 text-center text-sm">Nenhuma oferta parecida encontrada. Tente outro termo.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {result.offers.slice(0, 8).map((o, i) => {
                const isConfirmed = confirmed === o.externalId;
                return (
                  <li
                    key={`${o.source}-${o.externalId}`}
                    className="anim-rise-in flex gap-3 py-3"
                    style={{ animationDelay: `${Math.min(i, 7) * 35}ms` }}
                  >
                    <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-inset ring-slate-200 dark:ring-slate-700">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {o.imageUrl && <img src={o.imageUrl} alt="" className="h-full w-full object-contain" loading="lazy" />}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="line-clamp-2 text-sm font-medium">{o.title}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span
                          className={`rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${
                            o.shipFrom === "BR"
                              ? "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30"
                              : "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                          }`}
                        >
                          {o.shipFrom === "BR" ? "Nacional" : `Importado${o.shipFrom ? ` (${o.shipFrom})` : ""}`}
                        </span>
                        <span className="muted">{o.sourceName}</span>
                        {o.exact ? (
                          <span className="font-medium text-emerald-700 dark:text-emerald-400">· mesmo modelo</span>
                        ) : (
                          <span className="muted">· {o.matchScore}% parecido</span>
                        )}
                        {o.stock != null && <span className="muted">· estoque {o.stock.toLocaleString("pt-BR")}</span>}
                      </div>
                      <div className="text-sm">
                        {(o.currency !== "BRL" || o.priceMax != null || o.landedCost == null) && (
                          <span className="muted">
                            {o.priceMax ? "a partir de " : ""}
                            {money(o.unitPrice, o.currency)}
                            {o.priceMax ? ` (até ${money(o.priceMax, o.currency)} conforme a variação)` : ""}
                          </span>
                        )}
                        {o.landedCost != null ? (
                          <span className={`font-semibold ${o.currency !== "BRL" || o.priceMax != null ? "ml-2" : ""}`}>{brl(o.landedCost)} / un.</span>
                        ) : (
                          <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">{o.costNote ? COST_NOTE[o.costNote] : ""}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {onUseCost && o.landedCost != null && (
                          <button type="button" className="btn h-10 min-h-10 px-3 text-xs" onClick={() => onUseCost(o.landedCost!, o)}>
                            Usar este custo
                          </button>
                        )}
                        {onAction &&
                          (done[o.externalId] ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              <BadgeCheck className="h-4 w-4" aria-hidden /> {done[o.externalId]}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn h-10 min-h-10 px-3 text-xs"
                              disabled={pending}
                              onClick={() =>
                                start(async () => {
                                  const msg = await onAction(o);
                                  setDone((d) => ({ ...d, [o.externalId]: msg || "Feito" }));
                                })
                              }
                            >
                              {actionLabel ?? "Usar"}
                            </button>
                          ))}
                        {catalogId &&
                          (isConfirmed ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              <BadgeCheck className="h-4 w-4" aria-hidden /> Fornecedor confirmado
                            </span>
                          ) : (
                            <button type="button" className="btn-secondary h-10 min-h-10 px-3 text-xs" onClick={() => confirm(o)} disabled={pending}>
                              É o mesmo produto
                            </button>
                          ))}
                        {o.url && (
                          <a href={o.url} target="_blank" rel="noreferrer" className="btn-ghost h-10 min-h-10 px-2 text-xs">
                            Ver <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="muted text-xs">Frete do fornecedor até você não incluído: some no campo de envio ou em outros custos.</p>
        </>
      )}
    </section>
  );
}
