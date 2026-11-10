import { clamp, coefficientOfVariation, linearSlope, mean, median, piecewise } from "./stats";
import { priceForMargin, saleBreakdown, type SaleContext } from "./margin";

export type RiskComponentKey = "margin" | "volatility" | "competition" | "demand" | "turnover";
export type RiskWeights = Record<RiskComponentKey, number>;

export const DEFAULT_WEIGHTS: RiskWeights = {
  margin: 0.3,
  volatility: 0.15,
  competition: 0.15,
  demand: 0.2,
  turnover: 0.2,
};

export interface RiskInput extends SaleContext {
  /** preços atuais dos anúncios concorrentes */
  marketPrices: number[];
  /** mediana diária dos últimos ~30 dias (day = dias desde o início) */
  medianHistory?: { day: number; median: number }[];
  /** nº de vendedores ativos ao longo do tempo (mais antigo -> mais recente) */
  sellerCountHistory?: number[];
  /** fração dos anúncios de lojas oficiais / full (0..1) */
  officialSellerShare?: number;
  /** vendas/dia estimadas do mercado todo para esse produto */
  marketDailySales?: number;
  /** sinal de tendência normalizado: -1 (caindo forte) .. +1 (subindo forte) */
  trendSignal?: number;
  /** tamanho do lote que você pretende comprar */
  lotQty: number;
  /** fração das vendas do mercado que você espera capturar (ex.: 0.05) */
  expectedShare: number;
  /** margem alvo, fração (padrão 0.2) */
  targetMargin?: number;
  /** dias a partir dos quais o giro é 100% arriscado (padrão 90) */
  maxDaysToSell?: number;
  /** dias de venda que o lote recomendado deve cobrir (padrão 30) */
  coverageDays?: number;
  weights?: Partial<RiskWeights>;
}

export interface RiskComponent {
  key: RiskComponentKey;
  /** 0 (seguro) .. 100 (arriscado) */
  risk: number;
  weight: number;
  /** true quando faltou dado e o valor neutro (50) foi usado */
  missingData: boolean;
  reason: string;
}

export type RiskLevel = "baixo" | "medio" | "alto";

export interface RiskResult {
  score: number;
  level: RiskLevel;
  components: RiskComponent[];
  marketMedian: number;
  marginAtMedian: number;
  breakEvenPrice: number | null;
  suggestedPrice: number | null;
  estimatedDaysToSell: number | null;
  capitalAtRisk: number;
  recommendedLotQty: number;
  explanation: string[];
}

// textos em português: vírgula decimal e milhar com ponto
const dec = (v: number, d: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v: number) => `${dec(v * 100, 1)}%`;

export function computeRisk(input: RiskInput): RiskResult {
  const weights = { ...DEFAULT_WEIGHTS, ...input.weights };
  const targetMargin = input.targetMargin ?? 0.2;
  const maxDays = input.maxDaysToSell ?? 90;
  const coverageDays = input.coverageDays ?? 30;
  const components: RiskComponent[] = [];
  const neutral = (key: RiskComponentKey, reason: string): RiskComponent => ({
    key,
    risk: 50,
    weight: weights[key],
    missingData: true,
    reason,
  });

  // 1. Margem vendendo pela mediana do mercado
  const marketMedian = median(input.marketPrices);
  let marginAtMedian = NaN;
  if (Number.isFinite(marketMedian)) {
    marginAtMedian = saleBreakdown(marketMedian, input).marginPct;
    components.push({
      key: "margin",
      risk: piecewise(marginAtMedian, [
        [0.05, 100],
        [0.15, 70],
        [0.3, 20],
        [0.4, 0],
      ]),
      weight: weights.margin,
      missingData: false,
      reason: `margem líquida de ${pct(marginAtMedian)} vendendo pela mediana (R$ ${dec(marketMedian, 2)})`,
    });
  } else components.push(neutral("margin", "sem preços de mercado coletados"));

  // 2. Volatilidade + queda de preço
  const hist = input.medianHistory ?? [];
  if (hist.length >= 5) {
    const values = hist.map((h) => h.median);
    const cv = coefficientOfVariation(values);
    const slope = linearSlope(hist.map((h) => ({ x: h.day, y: h.median })));
    const drop30 = Math.max(0, (-slope * 30) / mean(values));
    components.push({
      key: "volatility",
      risk: clamp((cv / 0.2) * 60 + (drop30 / 0.2) * 40),
      weight: weights.volatility,
      missingData: false,
      reason:
        drop30 > 0.03
          ? `preço caindo ~${pct(drop30)} em 30 dias (variação ${pct(cv)})`
          : `preço com variação de ${pct(cv)} no período`,
    });
  } else components.push(neutral("volatility", "histórico de preço insuficiente (< 5 dias)"));

  // 3. Concorrência
  const sellers = input.sellerCountHistory ?? [];
  if (sellers.length) {
    const current = sellers[sellers.length - 1]!;
    const first = sellers[0]!;
    const growth = first > 0 ? (current - first) / first : 0;
    const official = input.officialSellerShare ?? 0;
    const base = piecewise(Math.log10(Math.max(1, current)), [
      [Math.log10(5), 10],
      [Math.log10(100), 85],
    ]);
    components.push({
      key: "competition",
      risk: clamp(base + Math.max(0, growth) * 50 + official * 20),
      weight: weights.competition,
      missingData: false,
      reason:
        `${current} concorrentes ativos` +
        (growth > 0.05 ? `, crescendo ${pct(growth)} no período` : "") +
        (official > 0.2 ? `, ${pct(official)} lojas oficiais/full` : ""),
    });
  } else components.push(neutral("competition", "sem dados de concorrência"));

  // 4. Demanda
  if (input.marketDailySales != null) {
    const base = piecewise(Math.log10(input.marketDailySales + 1), [
      [0, 100],
      [Math.log10(51), 0],
    ]);
    const trend = input.trendSignal ?? 0;
    components.push({
      key: "demand",
      risk: clamp(base - trend * 20),
      weight: weights.demand,
      missingData: false,
      reason:
        `~${dec(input.marketDailySales, 1)} vendas/dia no mercado` +
        (trend > 0.2 ? ", tendência de alta" : trend < -0.2 ? ", tendência de queda" : ""),
    });
  } else components.push(neutral("demand", "sem estimativa de vendas"));

  // 5. Giro do lote
  const myDaily = (input.marketDailySales ?? 0) * input.expectedShare;
  const estimatedDaysToSell = myDaily > 0 ? input.lotQty / myDaily : null;
  if (estimatedDaysToSell != null) {
    components.push({
      key: "turnover",
      risk: piecewise(estimatedDaysToSell, [
        [15, 0],
        [maxDays, 100],
      ]),
      weight: weights.turnover,
      missingData: false,
      reason: `lote de ${input.lotQty} un. leva ~${Math.ceil(estimatedDaysToSell)} dias para vender`,
    });
  } else components.push(neutral("turnover", "não dá para estimar o giro sem vendas/dia"));

  const totalWeight = components.reduce((a, c) => a + c.weight, 0) || 1;
  const score = Math.round(components.reduce((a, c) => a + c.risk * c.weight, 0) / totalWeight);
  const level: RiskLevel = score < 35 ? "baixo" : score < 60 ? "medio" : "alto";

  const breakEvenPrice = priceForMargin(0, input);
  const targetPrice = priceForMargin(targetMargin, input);
  let suggestedPrice = targetPrice;
  if (targetPrice != null && Number.isFinite(marketMedian) && targetPrice < marketMedian) {
    // a margem alvo cabe abaixo da mediana: fica um pouco abaixo dela para competir
    suggestedPrice = Math.max(targetPrice, Math.round(marketMedian * 0.98 * 100) / 100);
  }

  const explanation = [...components]
    .filter((c) => !c.missingData)
    .sort((a, b) => b.risk * b.weight - a.risk * a.weight)
    .slice(0, 3)
    .map((c) => c.reason);
  const missing = components.filter((c) => c.missingData);
  if (missing.length) explanation.push(`dados faltando: ${missing.map((c) => c.reason).join("; ")}`);
  if (targetPrice != null && Number.isFinite(marketMedian) && targetPrice > marketMedian)
    explanation.push(
      `para ter ${pct(targetMargin)} de margem precisaria vender a R$ ${dec(targetPrice, 2)}, acima da mediana`,
    );

  return {
    score,
    level,
    components,
    marketMedian,
    marginAtMedian,
    breakEvenPrice,
    suggestedPrice,
    estimatedDaysToSell,
    capitalAtRisk: Math.round(input.lotQty * input.landedCost * 100) / 100,
    recommendedLotQty: Math.floor(myDaily * coverageDays),
    explanation,
  };
}
