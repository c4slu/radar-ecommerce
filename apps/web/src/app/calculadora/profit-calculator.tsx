"use client";

import { useMemo, useState, useTransition } from "react";
import { Zap } from "lucide-react";
import { calculateProfit, computeRisk, parseLocaleNumber, priceForTargetMargin, type ProfitInput } from "@radar/core";
import type { CalcFees, CalcProduct } from "@/lib/calculator-data";
import { fetchCalcProduct, fetchFees } from "./actions";
import { SupplierPanel } from "./supplier-panel";

type ListingType = "classico" | "premium";
type ShipMode = "coleta" | "flex" | "full";
type TaxMode = "mei" | "4" | "6" | "outro";

const brl = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "-" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pctFmt = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? "-" : `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
const n = (v: string) => parseLocaleNumber(v) ?? 0;
const money = (v: number | null | undefined) => (v == null ? "" : v.toFixed(2).replace(".", ","));

const SHIP_HINT: Record<ShipMode, string> = {
  coleta: "Parte do frete que você paga ao despachar na agência/coleta. Acima de R$ 79 o frete grátis é obrigatório.",
  flex: "Custo da sua entrega própria (motoboy) por pedido.",
  full: "Frete que você paga + armazenagem do Full por unidade.",
};

export function ProfitCalculator({
  initialProduct,
  initialFees,
  initialCost,
  loadError,
  settings,
  supplierMatch,
}: {
  initialProduct: CalcProduct | null;
  initialFees: CalcFees;
  initialCost: number | null;
  loadError: string | null;
  settings: { expectedShare: number; targetMargin: number; maxDaysToSell: number; coverageDays: number };
  /** fornecedor já vinculado a este produto do catálogo (confirmado ou estimado) */
  supplierMatch?: { externalId: string; title: string; landedCost: number | null; confirmed: boolean } | null;
}) {
  const [product, setProduct] = useState(initialProduct);
  const [fees, setFees] = useState(initialFees);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(loadError);
  const [pending, start] = useTransition();

  const [price, setPrice] = useState(money(initialProduct?.priceMedian ?? initialProduct?.priceMin) || "");
  const autoCost = initialCost ?? (supplierMatch?.confirmed ? supplierMatch.landedCost : null);
  const [cost, setCost] = useState(money(autoCost) || "");
  const [costFrom, setCostFrom] = useState<string | null>(initialCost == null && supplierMatch?.confirmed && supplierMatch.landedCost != null ? supplierMatch.title : null);
  const [type, setType] = useState<ListingType>("classico");
  const [ship, setShip] = useState<ShipMode>("coleta");
  const [shipCost, setShipCost] = useState<Record<ShipMode, string>>({ coleta: "", flex: "", full: "" });
  const [storage, setStorage] = useState("");
  const [tax, setTax] = useState<TaxMode>("mei");
  const [taxOther, setTaxOther] = useState("");
  const [das, setDas] = useState("");
  const [monthlyUnits, setMonthlyUnits] = useState("100");
  const [adsOn, setAdsOn] = useState(false);
  const [ads, setAds] = useState("10");
  const [packaging, setPackaging] = useState("");
  const [showDetail, setShowDetail] = useState(false);
  const [lot, setLot] = useState("100");
  const [daily, setDaily] = useState("");

  const loadProduct = () =>
    start(async () => {
      setError(null);
      const r = await fetchCalcProduct(link);
      if (r.error || !r.product) return setError(r.error ?? "Falha ao carregar");
      setProduct(r.product);
      if (r.fees) setFees(r.fees);
      setPrice(money(r.product.priceMedian ?? r.product.priceMin));
    });

  /** Ao mudar o preço, busca a tarifa oficial daquela faixa (pode haver tarifa fixa abaixo de certos valores). */
  const refreshFees = (p: number) => {
    if (!product?.categoryId || !(p > 0)) return;
    start(async () => setFees(await fetchFees(p, product.categoryId)));
  };
  const usePrice = (v: number | null) => {
    if (v == null) return;
    setPrice(money(v));
    refreshFees(v);
  };

  const input = useMemo(() => {
    const p = n(price);
    const units = Math.max(1, n(monthlyUnits));
    const base: Omit<ProfitInput, "feePct" | "fixedFee"> = {
      price: p,
      cost: n(cost),
      shipping: n(shipCost[ship]),
      taxPct: tax === "mei" ? 0 : tax === "outro" ? n(taxOther) / 100 : Number(tax) / 100,
      adsPct: adsOn ? n(ads) / 100 : 0,
      packaging: n(packaging),
      otherPerUnit: (ship === "full" ? n(storage) : 0) + (tax === "mei" && das ? n(das) / units : 0),
    };
    return base;
  }, [price, cost, ship, shipCost, storage, tax, taxOther, das, monthlyUnits, adsOn, ads, packaging]);

  const resultFor = (t: ListingType) => calculateProfit({ ...input, feePct: fees[t].pct, fixedFee: fees[t].fixed });
  const result = resultFor(type);
  const other = resultFor(type === "classico" ? "premium" : "classico");
  const target = priceForTargetMargin({ ...input, feePct: fees[type].pct, fixedFee: fees[type].fixed }, settings.targetMargin);

  const risk = useMemo(() => {
    if (!product || !product.prices.length || !(input.price > 0)) return null;
    return computeRisk({
      marketplace: "mercadolivre",
      feeRules: [{ marketplace: "mercadolivre", commissionPct: fees[type].pct, fixedFee: fees[type].fixed }],
      landedCost: input.cost,
      shippingCost: (input.shipping ?? 0) + (input.otherPerUnit ?? 0) + (input.packaging ?? 0),
      taxPct: (input.taxPct ?? 0) + (input.adsPct ?? 0),
      marketPrices: product.prices,
      sellerCountHistory: [product.listings],
      officialSellerShare: product.officialShare,
      marketDailySales: daily ? n(daily) : undefined,
      lotQty: Math.max(1, n(lot)),
      expectedShare: settings.expectedShare,
      targetMargin: settings.targetMargin,
      maxDaysToSell: settings.maxDaysToSell,
      coverageDays: settings.coverageDays,
    });
  }, [product, input, fees, type, lot, daily, settings]);

  const lotQty = Math.max(0, n(lot));
  const tone = result.status === "lucro" ? "emerald" : result.status === "prejuizo" ? "red" : "zinc";

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
      <div className="space-y-4">
        {/* 1. Produto */}
        <section className="card space-y-3">
          {product ? (
            <>
              <div className="flex gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {product.pictureUrl && <img src={product.pictureUrl} alt="" className="h-full w-full object-contain" />}
                </div>
                <div className="min-w-0">
                  <a href={product.permalink} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm font-medium hover:underline">
                    {product.name}
                  </a>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    {product.fullShare > 0 && <Chip tone="emerald"><Zap className="-mt-px mr-0.5 inline h-3 w-3" aria-hidden />FULL {pctFmt(product.fullShare, 0)}</Chip>}
                    <Chip>{product.listings} anúncios</Chip>
                    {product.ageDays != null && <Chip>{product.ageDays}d no catálogo</Chip>}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <div className="text-sm">
                  <div className="text-xs text-zinc-500">Menor preço · mediana</div>
                  <span className="text-lg font-semibold">{brl(product.priceMin)}</span>
                  <span className="text-zinc-500"> · {brl(product.priceMedian)}</span>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => usePrice(product.priceMin)} className="rounded-lg bg-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-950 hover:bg-emerald-300">
                    Usar menor
                  </button>
                  <button type="button" onClick={() => usePrice(product.priceMedian)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700">
                    Mediana
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-500">Cole o link de um produto do catálogo do ML (ou venha pelo botão Calcular das Oportunidades) para usar preços e tarifas reais.</p>
          )}
          <div className="flex gap-2">
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.mercadolivre.com.br/…/p/MLB…" className="input" />
            <button type="button" onClick={loadProduct} disabled={!link || pending} className="btn shrink-0 disabled:opacity-50">
              {pending ? "..." : "Carregar"}
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </section>

        {product && (
          <SupplierPanel
            title={product.name}
            brand={product.brand}
            model={product.model}
            catalogId={product.id}
            confirmedId={supplierMatch?.confirmed ? supplierMatch.externalId : null}
            onUseCost={(c, o) => {
              setCost(money(c));
              setCostFrom(o.title);
            }}
          />
        )}

        {/* 2. Entradas */}
        <section className="card space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <MoneyField label="Preço de venda" value={price} onChange={setPrice} onBlur={() => refreshFees(n(price))} />
            <MoneyField
              label="Custo do produto"
              value={cost}
              onChange={(v) => {
                setCost(v);
                setCostFrom(null);
              }}
            />
          </div>
          {costFrom && <p className="muted -mt-2 line-clamp-1 text-xs">Custo do fornecedor: {costFrom}</p>}
          <hr className="border-[var(--border)]" />
          <Segmented
            label="Tipo de anúncio"
            value={type}
            onChange={setType}
            options={[
              { value: "classico", label: `Clássico (${pctFmt(fees.classico.pct, 1)})` },
              { value: "premium", label: `Premium (${pctFmt(fees.premium.pct, 1)})` },
            ]}
          />
          {fees.source === "padrao" && <p className="-mt-2 text-xs text-zinc-400">Tarifa padrão; carregue um produto para usar a tarifa oficial da categoria.</p>}
          {fees[type].fixed > 0 && <p className="-mt-2 text-xs text-zinc-500">Inclui tarifa fixa de {brl(fees[type].fixed)} por venda nesta faixa de preço.</p>}
          <Segmented
            label="Envio"
            value={ship}
            onChange={setShip}
            options={[
              { value: "full", label: "Full" },
              { value: "flex", label: "Flex" },
              { value: "coleta", label: "Coleta" },
            ]}
          />
          <div className="-mt-1 grid grid-cols-2 gap-3">
            <MoneyField label="Custo de envio / un" value={shipCost[ship]} onChange={(v) => setShipCost((s) => ({ ...s, [ship]: v }))} />
            {ship === "full" && <MoneyField label="Armazenagem / un" value={storage} onChange={setStorage} />}
          </div>
          <p className="-mt-2 text-xs text-zinc-500">
            {SHIP_HINT[ship]}
            {n(price) >= 79 && !n(shipCost[ship]) && <span className="text-amber-600"> Preço acima de R$ 79: informe o custo do frete grátis.</span>}
          </p>
          <Segmented
            label="Impostos"
            value={tax}
            onChange={setTax}
            options={[
              { value: "mei", label: "MEI" },
              { value: "4", label: "4%" },
              { value: "6", label: "6%" },
              { value: "outro", label: "Outro" },
            ]}
          />
          {tax === "mei" && (
            <div className="-mt-1 grid grid-cols-2 gap-3">
              <MoneyField label="DAS mensal (opcional)" value={das} onChange={setDas} />
              <TextField label="Vendas por mês" value={monthlyUnits} onChange={setMonthlyUnits} />
            </div>
          )}
          {tax === "outro" && <TextField label="Alíquota (%)" value={taxOther} onChange={setTaxOther} />}
          <div className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <span className="text-sm font-medium">Publicidade</span>
            <div className="flex items-center gap-2">
              {adsOn && (
                <div className="flex items-center gap-1 text-sm">
                  <input value={ads} onChange={(e) => setAds(e.target.value)} className="input w-16 py-1 text-right" inputMode="decimal" />%
                </div>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={adsOn}
                onClick={() => setAdsOn((v) => !v)}
                className={`relative h-6 w-11 rounded-full transition ${adsOn ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${adsOn ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
          </div>
          <MoneyField label="Embalagem / outros por unidade" value={packaging} onChange={setPackaging} />
        </section>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4">
        {/* 3. Resultado */}
        <section className={`card space-y-4 border-t-4 ${tone === "emerald" ? "border-t-emerald-400" : tone === "red" ? "border-t-red-400" : "border-t-zinc-300"}`}>
          <div className="flex items-center justify-between">
            <Chip>Resultado</Chip>
            <Chip tone={tone === "emerald" ? "emerald" : tone === "red" ? "red" : undefined}>
              {result.status === "lucro" ? "Lucro" : result.status === "prejuizo" ? "Prejuízo" : "Empate"}
            </Chip>
          </div>
          <div>
            <div className={`text-4xl font-bold ${tone === "red" ? "text-red-600" : ""}`}>{brl(result.profit)}</div>
            <div className="text-xs text-zinc-500">lucro por unidade vendida</div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            <Metric label="Margem" value={pctFmt(result.margin)} />
            <Metric label="ROI" value={result.roi == null ? "—" : pctFmt(result.roi, 0)} />
            <Metric label="Preço mín." value={brl(result.minPrice)} />
          </div>
          <div className="rounded-xl border border-[var(--border)]">
            <button type="button" onClick={() => setShowDetail((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium">
              Detalhamento de custos
              <span className="text-zinc-500">
                {brl(result.sellingCosts)} {showDetail ? "▴" : "▾"}
              </span>
            </button>
            {showDetail && (
              <ul className="space-y-1.5 border-t border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
                {result.lines.map((l) => (
                  <li key={l.key} className="flex justify-between">
                    <span className="text-zinc-500">{l.label}</span>
                    <span>{brl(l.amount)}</span>
                  </li>
                ))}
                <li className="flex justify-between border-t border-zinc-100 pt-1.5 font-medium dark:border-zinc-800">
                  <span>Total</span>
                  <span>{brl(result.totalCosts)}</span>
                </li>
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/50">
              <div className="text-xs text-zinc-500">No {type === "classico" ? "Premium" : "Clássico"}</div>
              <div className="font-semibold">{brl(other.profit)}</div>
              <div className="text-xs text-zinc-500">margem {pctFmt(other.margin, 1)}</div>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/50">
              <div className="text-xs text-zinc-500">Preço p/ {pctFmt(settings.targetMargin, 0)} de margem</div>
              <div className="font-semibold">{brl(target)}</div>
              {product?.priceMin != null && target != null && (
                <div className={`text-xs ${target <= product.priceMin ? "text-emerald-600" : "text-amber-600"}`}>
                  {target <= product.priceMin ? "abaixo do menor preço" : "acima do menor preço"}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 4. Lote e risco */}
        <section className="card space-y-3">
          <h2 className="text-sm font-medium">Lote</h2>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Quantidade" value={lot} onChange={setLot} />
            <TextField label="Vendas/dia do produto (se souber)" value={daily} onChange={setDaily} />
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-zinc-500">Capital</div>
              <div className="font-semibold">{brl(lotQty * n(cost))}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Lucro do lote</div>
              <div className={`font-semibold ${result.profit < 0 ? "text-red-600" : ""}`}>{brl(lotQty * result.profit)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Dias p/ vender</div>
              <div className="font-semibold">{risk?.estimatedDaysToSell != null ? Math.ceil(risk.estimatedDaysToSell) : "—"}</div>
            </div>
          </div>
          {risk ? (
            <div className="space-y-2 rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-800/50">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">{risk.score}</span>
                <Chip tone={risk.level === "baixo" ? "emerald" : risk.level === "alto" ? "red" : "amber"}>risco {risk.level}</Chip>
              </div>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
                {risk.explanation.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Carregue um produto do catálogo para ver o risco com os preços e a concorrência reais.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium">{label}</div>
      <div className="surface-2 flex gap-1 rounded-xl p-1" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`flex-1 rounded-lg px-2 py-2 text-xs transition sm:text-sm ${
              value === o.value ? "bg-[var(--surface)] font-medium shadow-sm ring-1 ring-[var(--border)]" : "muted hover:text-[var(--fg)]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MoneyField({ label, value, onChange, onBlur }: { label: string; value: string; onChange: (v: string) => void; onBlur?: () => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div className="money-field flex items-center rounded-xl border px-3">
        <span className="muted text-sm">R$</span>
        <input value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} inputMode="decimal" placeholder="0,00" className="w-full bg-transparent px-2 py-2.5 text-sm outline-none" />
      </div>
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-zinc-500">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" className="input" />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "emerald" | "red" | "amber" }) {
  const cls =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300"
      : tone === "red"
        ? "border-red-200 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-900/40 dark:text-red-300"
        : tone === "amber"
          ? "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-900/40 dark:text-amber-300"
          : "border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
