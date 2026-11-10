import { clamp, linearSlope, mean, piecewise } from "./stats";

/**
 * Score de oportunidade de revenda (0–100, MAIOR = MELHOR) para um produto de catálogo do ML.
 * O ML não informa quantidade vendida: a demanda vem do ranking de mais vendidos da categoria
 * (posição, constância e tendência) e a concorrência do número de anúncios do produto.
 */

export interface OpportunityInput {
  /** melhor posição de hoje entre as categorias em que aparece (1..20) */
  position: number;
  /** posições diárias nos últimos 14 dias (mais antiga -> mais recente), só dos dias em que apareceu */
  positionHistory: { day: number; position: number }[];
  /** em quantos dos últimos 14 dias apareceu no top 20 */
  daysInTop: number;
  /** em quantas categorias aparece hoje */
  categoriesCount: number;
  /** total de anúncios do produto no catálogo */
  listings: number;
  /** anúncios há 7 dias (para medir crescimento da concorrência) */
  listingsWeekAgo?: number | null;
  /** fração dos anúncios lidos que são Full / loja oficial */
  fullShare: number;
  officialShare: number;
  priceMin: number | null;
  priceMedian: number | null;
  priceMax: number | null;
  /** idade do produto no catálogo, em dias */
  catalogAgeDays?: number | null;
  /** dias desde a primeira aparição no ranking */
  firstSeenDaysAgo?: number | null;
}

export interface OpportunityPrefs {
  priceMinPref: number;
  priceMaxPref: number;
  weights: { demand: number; competition: number; price: number; novelty: number };
}

export const DEFAULT_OPPORTUNITY_PREFS: OpportunityPrefs = {
  priceMinPref: 30,
  priceMaxPref: 300,
  weights: { demand: 0.4, competition: 0.35, price: 0.15, novelty: 0.1 },
};

export type OpportunityLevel = "forte" | "boa" | "fraca";

export interface OpportunityResult {
  score: number;
  level: OpportunityLevel;
  parts: { demand: number; competition: number; price: number; novelty: number };
  /** variação de posição em 14 dias: positivo = subiu (melhorou) */
  positionChange: number;
  badges: { text: string; tone: "green" | "amber" | "red" | "blue" }[];
}

export function computeOpportunity(i: OpportunityInput, prefs: OpportunityPrefs = DEFAULT_OPPORTUNITY_PREFS): OpportunityResult {
  const badges: OpportunityResult["badges"] = [];

  // ---- Demanda: posição, constância, tendência, presença em várias categorias
  const posScore = piecewise(i.position, [
    [1, 100],
    [5, 85],
    [10, 70],
    [20, 50],
  ]);
  const consistency = clamp((i.daysInTop / 14) * 100);
  // slope em posições/dia; negativo = posição caindo de número = subindo no ranking
  const slope = i.positionHistory.length >= 3 ? linearSlope(i.positionHistory.map((h) => ({ x: h.day, y: h.position }))) : 0;
  const first = i.positionHistory[0]?.position;
  const positionChange = first != null ? first - i.position : 0;
  const trendScore = clamp(50 - slope * 25);
  const multiCat = Math.min(15, (i.categoriesCount - 1) * 5);
  const demand = clamp(posScore * 0.55 + consistency * 0.25 + trendScore * 0.2 + multiCat);

  if (i.position <= 5) badges.push({ text: `Top ${i.position} da categoria`, tone: "green" });
  if (positionChange >= 3) badges.push({ text: `Subindo +${positionChange} posições`, tone: "green" });
  else if (positionChange <= -3) badges.push({ text: `Caindo ${positionChange} posições`, tone: "amber" });
  if (i.daysInTop >= 12) badges.push({ text: "Constante no top", tone: "blue" });

  // ---- Concorrência: poucos anúncios, pouco Full/oficial, concorrência não crescendo
  const listingsScore = piecewise(Math.log10(Math.max(1, i.listings)), [
    [Math.log10(3), 100],
    [Math.log10(10), 60],
    [Math.log10(30), 15],
    [Math.log10(100), 0],
  ]);
  const growth = i.listingsWeekAgo && i.listingsWeekAgo > 0 ? (i.listings - i.listingsWeekAgo) / i.listingsWeekAgo : 0;
  const competition = clamp(listingsScore - i.fullShare * 20 - i.officialShare * 15 - Math.max(0, growth) * 40);

  if (i.listings <= 5) badges.push({ text: i.listings === 1 ? "Só 1 anúncio" : `Só ${i.listings} anúncios`, tone: "green" });
  else if (i.listings >= 30) badges.push({ text: `${i.listings} anúncios`, tone: "red" });
  if (i.fullShare === 0 && i.listings > 0) badges.push({ text: "Sem Full", tone: "blue" });
  if (i.officialShare >= 0.5) badges.push({ text: "Loja oficial domina", tone: "amber" });
  if (growth >= 0.3) badges.push({ text: `Concorrência +${Math.round(growth * 100)}% na semana`, tone: "amber" });

  // ---- Preço: ticket na faixa preferida e espaço entre menor e maior preço
  const ticket = i.priceMedian ?? i.priceMin;
  let inRange = 50;
  if (ticket != null) {
    if (ticket >= prefs.priceMinPref && ticket <= prefs.priceMaxPref) inRange = 100;
    else if (ticket < prefs.priceMinPref) inRange = clamp((ticket / prefs.priceMinPref) * 70);
    else inRange = clamp(100 - ((ticket - prefs.priceMaxPref) / prefs.priceMaxPref) * 100);
  }
  const spread = i.priceMin && i.priceMax && i.priceMin > 0 ? i.priceMax / i.priceMin - 1 : 0;
  const spreadScore = piecewise(spread, [
    [0, 30],
    [0.3, 70],
    [1, 100],
  ]);
  const price = clamp(inRange * 0.7 + spreadScore * 0.3);
  if (ticket != null && (ticket < prefs.priceMinPref || ticket > prefs.priceMaxPref)) badges.push({ text: "Fora da sua faixa de preço", tone: "amber" });

  // ---- Novidade: produto recente no catálogo ou recém-chegado ao ranking
  let novelty = 30;
  if (i.catalogAgeDays != null) novelty = piecewise(i.catalogAgeDays, [
    [30, 100],
    [180, 60],
    [720, 20],
  ]);
  if (i.firstSeenDaysAgo != null && i.firstSeenDaysAgo <= 7) novelty = Math.max(novelty, 80);
  if (i.catalogAgeDays != null && i.catalogAgeDays <= 90) badges.push({ text: "Novo no catálogo", tone: "blue" });

  const w = prefs.weights;
  const total = w.demand + w.competition + w.price + w.novelty || 1;
  const score = Math.round((demand * w.demand + competition * w.competition + price * w.price + novelty * w.novelty) / total);
  const level: OpportunityLevel = score >= 70 ? "forte" : score >= 50 ? "boa" : "fraca";

  return {
    score,
    level,
    parts: { demand: Math.round(demand), competition: Math.round(competition), price: Math.round(price), novelty: Math.round(novelty) },
    positionChange,
    badges,
  };
}

/** Média simples útil para agregar oportunidades por categoria. */
export const averageScore = (xs: number[]) => (xs.length ? Math.round(mean(xs)) : 0);
