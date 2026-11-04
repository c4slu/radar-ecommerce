import { feeAmount, pickFeeRule, type FeeRule, type Marketplace } from "./fees";

export interface LandedCostInput {
  /** preço unitário pago ao fornecedor, já em R$ */
  unitPrice: number;
  quantity: number;
  /** frete total do lote até você */
  freightTotal?: number;
  /** impostos de importação / DIFAL / outros custos totais do lote */
  otherCostsTotal?: number;
}

/** Custo unitário final ("landed cost") de um lote. */
export function landedCost(i: LandedCostInput): number {
  if (i.quantity <= 0) throw new Error("quantity deve ser > 0");
  return i.unitPrice + ((i.freightTotal ?? 0) + (i.otherCostsTotal ?? 0)) / i.quantity;
}

export interface SaleContext {
  marketplace: Marketplace;
  feeRules: FeeRule[];
  categoryId?: string | null;
  /** custo unitário final do produto */
  landedCost: number;
  /** frete pago por você por unidade */
  shippingCost?: number;
  /** alíquota sobre a venda (Simples Nacional etc.), fração */
  taxPct?: number;
  /** embalagem, etiqueta etc. por unidade */
  packagingCost?: number;
}

export interface SaleBreakdown {
  price: number;
  fee: number;
  tax: number;
  shipping: number;
  packaging: number;
  landedCost: number;
  profit: number;
  /** lucro / preço */
  marginPct: number;
  /** lucro / custo */
  roiPct: number;
  rule?: FeeRule;
}

export function saleBreakdown(price: number, ctx: SaleContext): SaleBreakdown {
  const rule = pickFeeRule(ctx.feeRules, ctx.marketplace, price, ctx.categoryId);
  const fee = rule ? feeAmount(rule, price) : 0;
  const tax = price * (ctx.taxPct ?? 0);
  const shipping = ctx.shippingCost ?? 0;
  const packaging = ctx.packagingCost ?? 0;
  const profit = price - fee - tax - shipping - packaging - ctx.landedCost;
  return {
    price,
    fee,
    tax,
    shipping,
    packaging,
    landedCost: ctx.landedCost,
    profit,
    marginPct: price > 0 ? profit / price : 0,
    roiPct: ctx.landedCost > 0 ? profit / ctx.landedCost : 0,
    rule,
  };
}

/**
 * Menor preço que atinge a margem alvo (0 = break-even).
 * Testa cada regra de tarifa aplicável e fica com o menor preço que cai
 * dentro da faixa da própria regra.
 */
export function priceForMargin(targetMargin: number, ctx: SaleContext): number | null {
  const rules = ctx.feeRules.filter(
    (r) => r.marketplace === ctx.marketplace && (r.categoryId == null || r.categoryId === ctx.categoryId),
  );
  const fixedCosts = ctx.landedCost + (ctx.shippingCost ?? 0) + (ctx.packagingCost ?? 0);
  const tax = ctx.taxPct ?? 0;
  const candidates: number[] = [];
  const options: (FeeRule | undefined)[] = rules.length ? rules : [undefined];
  for (const r of options) {
    const denom = 1 - (r?.commissionPct ?? 0) - tax - targetMargin;
    if (denom <= 0) continue;
    const p = (fixedCosts + (r?.fixedFee ?? 0)) / denom;
    // confere se a regra que vale para esse preço é de fato `r`
    const chosen = pickFeeRule(ctx.feeRules, ctx.marketplace, p, ctx.categoryId);
    if (!r || chosen === r) candidates.push(p);
  }
  if (!candidates.length) return null;
  return Math.round(Math.min(...candidates) * 100) / 100;
}
