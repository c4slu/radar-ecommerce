export const MARKETPLACES = ["mercadolivre", "shopee", "tiktokshop"] as const;
export type Marketplace = (typeof MARKETPLACES)[number];

/**
 * Regra de tarifa de um marketplace. Os valores vêm da tabela `marketplace_fees`
 * (editável no app), pois as taxas mudam com frequência.
 */
export interface FeeRule {
  marketplace: Marketplace;
  /** null = vale para todas as categorias */
  categoryId?: string | null;
  /** fração, ex.: 0.14 = 14% */
  commissionPct: number;
  /** tarifa fixa por unidade vendida, em R$ */
  fixedFee: number;
  /** faixa de preço (inclusiva no mínimo, exclusiva no máximo) em que a regra vale */
  minPrice?: number | null;
  maxPrice?: number | null;
}

const inRange = (r: FeeRule, price: number) =>
  (r.minPrice == null || price >= r.minPrice) && (r.maxPrice == null || price < r.maxPrice);

/** Escolhe a regra mais específica (categoria > genérica) que cobre o preço. */
export function pickFeeRule(
  rules: FeeRule[],
  marketplace: Marketplace,
  price: number,
  categoryId?: string | null,
): FeeRule | undefined {
  const candidates = rules.filter((r) => r.marketplace === marketplace && inRange(r, price));
  return (
    (categoryId ? candidates.find((r) => r.categoryId === categoryId) : undefined) ??
    candidates.find((r) => r.categoryId == null)
  );
}

export function feeAmount(rule: FeeRule, price: number): number {
  return price * rule.commissionPct + rule.fixedFee;
}
