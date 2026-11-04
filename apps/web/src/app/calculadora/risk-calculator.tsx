"use client";

import { useMemo, useState } from "react";
import { computeRisk, MARKETPLACES, saleBreakdown, type FeeRule, type Marketplace } from "@radar/core";

const brl = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "-" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Valores de exemplo: confira as tarifas atuais na central do vendedor.
const DEFAULT_FEES: Record<Marketplace, { commission: number; fixed: number }> = {
  mercadolivre: { commission: 12, fixed: 6.75 },
  shopee: { commission: 20, fixed: 4 },
  tiktokshop: { commission: 6, fixed: 2 },
};

const LEVEL_STYLE = {
  baixo: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  medio: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  alto: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const COMPONENT_LABEL = {
  margin: "Margem",
  volatility: "Volatilidade",
  competition: "Concorrência",
  demand: "Demanda",
  turnover: "Giro do lote",
};

export function RiskCalculator() {
  const [f, setF] = useState({
    marketplace: "mercadolivre" as Marketplace,
    commission: "12",
    fixed: "6.75",
    landedCost: "30",
    shipping: "0",
    tax: "6",
    prices: "89.90, 95, 99.90, 104, 110",
    sellers: "12",
    dailySales: "25",
    trend: "0",
    lotQty: "100",
    share: "5",
    targetMargin: "20",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));
  const num = (v: string) => Number(v.replace(",", "."));

  const result = useMemo(() => {
    const feeRules: FeeRule[] = [
      { marketplace: f.marketplace, commissionPct: num(f.commission) / 100, fixedFee: num(f.fixed) },
    ];
    const marketPrices = f.prices
      .split(/[;\s]+|,\s+/)
      .map((p) => num(p))
      .filter((p) => Number.isFinite(p) && p > 0);
    const ctx = {
      marketplace: f.marketplace,
      feeRules,
      landedCost: num(f.landedCost),
      shippingCost: num(f.shipping),
      taxPct: num(f.tax) / 100,
    };
    const risk = computeRisk({
      ...ctx,
      marketPrices,
      sellerCountHistory: f.sellers ? [num(f.sellers)] : undefined,
      marketDailySales: f.dailySales ? num(f.dailySales) : undefined,
      trendSignal: num(f.trend),
      lotQty: num(f.lotQty),
      expectedShare: num(f.share) / 100,
      targetMargin: num(f.targetMargin) / 100,
    });
    const atSuggested = risk.suggestedPrice != null ? saleBreakdown(risk.suggestedPrice, ctx) : null;
    return { risk, atSuggested };
  }, [f]);

  const { risk, atSuggested } = result;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="card space-y-4">
        <Field label="Marketplace">
          <select
            className="input"
            value={f.marketplace}
            onChange={(e) => {
              const m = e.target.value as Marketplace;
              setF((s) => ({ ...s, marketplace: m, commission: String(DEFAULT_FEES[m].commission), fixed: String(DEFAULT_FEES[m].fixed) }));
            }}
          >
            {MARKETPLACES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Comissão (%)"><input className="input" value={f.commission} onChange={set("commission")} /></Field>
          <Field label="Tarifa fixa (R$)"><input className="input" value={f.fixed} onChange={set("fixed")} /></Field>
          <Field label="Custo unitário final (R$)"><input className="input" value={f.landedCost} onChange={set("landedCost")} /></Field>
          <Field label="Frete pago por você (R$/un)"><input className="input" value={f.shipping} onChange={set("shipping")} /></Field>
          <Field label="Imposto sobre venda (%)"><input className="input" value={f.tax} onChange={set("tax")} /></Field>
          <Field label="Margem alvo (%)"><input className="input" value={f.targetMargin} onChange={set("targetMargin")} /></Field>
        </div>
        <Field label="Preços dos concorrentes (R$, separados por vírgula e espaço)">
          <input className="input" value={f.prices} onChange={set("prices")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nº de vendedores"><input className="input" value={f.sellers} onChange={set("sellers")} /></Field>
          <Field label="Vendas/dia do mercado"><input className="input" value={f.dailySales} onChange={set("dailySales")} /></Field>
          <Field label="Tamanho do lote (un)"><input className="input" value={f.lotQty} onChange={set("lotQty")} /></Field>
          <Field label="Sua fatia esperada (%)"><input className="input" value={f.share} onChange={set("share")} /></Field>
        </div>
        <Field label={`Tendência: ${f.trend} (-1 queda, +1 alta)`}>
          <input type="range" min="-1" max="1" step="0.1" className="w-full" value={f.trend} onChange={set("trend")} />
        </Field>
      </div>

      <div className="space-y-4">
        <div className="card flex items-center gap-6">
          <div>
            <div className="text-xs text-zinc-500">Score de risco</div>
            <div className="text-5xl font-bold">{risk.score}</div>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${LEVEL_STYLE[risk.level]}`}>risco {risk.level}</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi label="Mediana do mercado" value={brl(risk.marketMedian)} />
          <Kpi label="Preço sugerido" value={brl(risk.suggestedPrice)} />
          <Kpi label="Preço mínimo (sem prejuízo)" value={brl(risk.breakEvenPrice)} />
          <Kpi label="Lucro/un no preço sugerido" value={brl(atSuggested?.profit)} />
          <Kpi label="Capital no lote" value={brl(risk.capitalAtRisk)} />
          <Kpi
            label="Dias p/ vender o lote"
            value={risk.estimatedDaysToSell == null ? "-" : String(Math.ceil(risk.estimatedDaysToSell))}
          />
        </div>

        <div className="card">
          <h2 className="mb-3 font-medium">Componentes</h2>
          <div className="space-y-2">
            {risk.components.map((c) => (
              <div key={c.key}>
                <div className="flex justify-between text-sm">
                  <span>{COMPONENT_LABEL[c.key]} <span className="text-zinc-400">({Math.round(c.weight * 100)}%)</span></span>
                  <span>{Math.round(c.risk)}</span>
                </div>
                <div className="h-2 rounded bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className={`h-2 rounded ${c.missingData ? "bg-zinc-400" : c.risk < 35 ? "bg-emerald-500" : c.risk < 60 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${c.risk}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="mb-2 font-medium">Por que esse score</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {risk.explanation.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-zinc-500">
            Lote recomendado para {30} dias: <strong>{risk.recommendedLotQty} un.</strong>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
