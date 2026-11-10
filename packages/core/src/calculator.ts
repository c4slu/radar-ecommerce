/**
 * Calculadora de lucro por unidade vendida (Mercado Livre e afins).
 * Todos os percentuais são frações (0.115 = 11,5%) aplicadas sobre o preço de venda.
 */
export interface ProfitInput {
  price: number;
  /** custo do produto (já com frete de compra e impostos de importação) */
  cost: number;
  /** comissão do marketplace (Clássico ~11,5%, Premium ~16,5%) */
  feePct: number;
  /** tarifa fixa por venda */
  fixedFee?: number;
  /** quanto você paga de envio por unidade (frete grátis, Flex, Full) */
  shipping?: number;
  /** imposto sobre a venda (Simples 4%, 6%...; MEI = 0 e o DAS vai em otherPerUnit) */
  taxPct?: number;
  /** publicidade (ACOS) sobre o preço */
  adsPct?: number;
  packaging?: number;
  /** outros custos por unidade: armazenagem Full, DAS do MEI rateado etc. */
  otherPerUnit?: number;
}

export interface ProfitLine {
  key: "fee" | "fixedFee" | "shipping" | "tax" | "ads" | "packaging" | "other" | "cost";
  label: string;
  amount: number;
}

export interface ProfitResult {
  lines: ProfitLine[];
  /** soma de todos os custos exceto o custo do produto (o "detalhamento" da venda) */
  sellingCosts: number;
  totalCosts: number;
  profit: number;
  /** lucro / preço */
  margin: number;
  /** lucro / custo do produto; null quando o custo é zero */
  roi: number | null;
  /** menor preço que não dá prejuízo; null se os percentuais somam 100% ou mais */
  minPrice: number | null;
  status: "lucro" | "empate" | "prejuizo";
}

// toFixed antes de arredondar evita o erro de ponto flutuante (16,675 * 100 = 1667,4999…); arredonda como o ML
const round2 = (v: number) => Math.round(Number((v * 100).toFixed(6))) / 100;

/** Lucro com cada linha arredondada em centavos, como o marketplace cobra. */
function roundedProfit(i: ProfitInput, price: number) {
  const pctLines = round2(price * i.feePct) + round2(price * (i.taxPct ?? 0)) + round2(price * (i.adsPct ?? 0));
  const fixed = round2(i.fixedFee ?? 0) + round2(i.shipping ?? 0) + round2(i.packaging ?? 0) + round2(i.otherPerUnit ?? 0);
  return round2(price - pctLines - fixed - i.cost);
}

/** Menor preço (em centavos) com lucro >= 0 depois dos arredondamentos. */
function breakEven(i: ProfitInput, pctTotal: number, fixedPerUnit: number): number | null {
  if (pctTotal >= 1) return null;
  let p = Math.ceil(((i.cost + fixedPerUnit) / (1 - pctTotal)) * 100) / 100;
  for (let k = 0; k < 10 && roundedProfit(i, p) < 0; k++) p = round2(p + 0.01);
  return p;
}

export function calculateProfit(i: ProfitInput): ProfitResult {
  const pctTotal = i.feePct + (i.taxPct ?? 0) + (i.adsPct ?? 0);
  const fixedPerUnit = (i.fixedFee ?? 0) + (i.shipping ?? 0) + (i.packaging ?? 0) + (i.otherPerUnit ?? 0);
  const all: ProfitLine[] = [
    { key: "fee", label: "Tarifa de venda", amount: round2(i.price * i.feePct) },
    { key: "fixedFee", label: "Tarifa fixa", amount: round2(i.fixedFee ?? 0) },
    { key: "shipping", label: "Envio", amount: round2(i.shipping ?? 0) },
    { key: "tax", label: "Impostos", amount: round2(i.price * (i.taxPct ?? 0)) },
    { key: "ads", label: "Publicidade", amount: round2(i.price * (i.adsPct ?? 0)) },
    { key: "packaging", label: "Embalagem", amount: round2(i.packaging ?? 0) },
    { key: "other", label: "Outros custos", amount: round2(i.otherPerUnit ?? 0) },
  ];
  const lines = all.filter((l) => l.key === "fee" || l.amount !== 0);
  const sellingCosts = round2(lines.reduce((a, l) => a + l.amount, 0));
  const totalCosts = round2(sellingCosts + i.cost);
  const profit = round2(i.price - totalCosts);
  const minPrice = breakEven(i, pctTotal, fixedPerUnit);
  return {
    lines: [...lines, { key: "cost", label: "Custo do produto", amount: round2(i.cost) }],
    sellingCosts,
    totalCosts,
    profit,
    margin: i.price > 0 ? profit / i.price : 0,
    roi: i.cost > 0 ? profit / i.cost : null,
    minPrice,
    status: Math.abs(profit) < 0.005 ? "empate" : profit > 0 ? "lucro" : "prejuizo",
  };
}

/** Preço que entrega a margem desejada (fração do preço). */
export function priceForTargetMargin(i: Omit<ProfitInput, "price">, targetMargin: number): number | null {
  const pct = i.feePct + (i.taxPct ?? 0) + (i.adsPct ?? 0) + targetMargin;
  if (pct >= 1) return null;
  const fixed = i.cost + (i.fixedFee ?? 0) + (i.shipping ?? 0) + (i.packaging ?? 0) + (i.otherPerUnit ?? 0);
  return Math.ceil((fixed / (1 - pct)) * 100) / 100;
}
