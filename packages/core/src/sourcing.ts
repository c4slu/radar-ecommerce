/**
 * Fornecedores: custo final de uma oferta e semelhança entre o produto do ML e a oferta.
 * Funções puras (sem rede/banco) para poderem ser testadas e usadas no app e nos jobs.
 */

export type SourcingMode = "nacional" | "importacao";

export interface OfferCostInput {
  /** preço unitário na moeda da oferta */
  unitPrice: number;
  currency: string;
  /** país de onde a oferta é enviada (ISO, ex.: BR, CN) */
  shipFrom: string | null;
  /** frete por unidade até você, na moeda da oferta (quando conhecido) */
  shippingPerUnit?: number | null;
}

export type OfferCostResult =
  | { cost: number; reason?: undefined }
  | { cost: null; reason: "importado" | "sem_cambio" | "preco_invalido" };

/**
 * Custo final por unidade em R$. No modo "nacional" ofertas enviadas de fora do Brasil
 * não entram no custo (o usuário ainda não importa); continuam visíveis, marcadas.
 */
export function offerLandedCost(
  o: OfferCostInput,
  opts: { fx: Record<string, number>; mode: SourcingMode; homeCountry?: string },
): OfferCostResult {
  if (!(o.unitPrice > 0)) return { cost: null, reason: "preco_invalido" };
  const home = opts.homeCountry ?? "BR";
  if (opts.mode === "nacional" && o.shipFrom !== home) return { cost: null, reason: "importado" };
  const rate = o.currency.toUpperCase() === "BRL" ? 1 : opts.fx[o.currency.toUpperCase()];
  if (!rate) return { cost: null, reason: "sem_cambio" };
  const total = (o.unitPrice + (o.shippingPerUnit ?? 0)) * rate;
  return { cost: Math.round(total * 100) / 100 };
}

// ---------- Semelhança de títulos ----------

const STOP = new Set(
  "de da do das dos e em para com sem a o as os um uma kit cor novo nova original promocao oferta frete gratis envio imediato pronta entrega the and for with of".split(
    " ",
  ),
);

/** Normaliza: minúsculas, sem acento, junta número+unidade ("500 ml" -> "500ml"). */
export function titleTokens(title: string): string[] {
  const s = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\d+(?:[.,]\d+)?)\s+(ml|l|g|kg|cm|mm|m|w|v|mah|gb|tb|pcs|un|pecas|unidades)\b/g, "$1$2")
    .replace(/[^a-z0-9]+/g, " ");
  return s.split(" ").filter((t) => t.length > 1 && !STOP.has(t));
}

/** Tokens com número ("500ml", "10", "64gb") pesam mais: medida errada = produto errado. */
const isSpec = (t: string) => /\d/.test(t);

/**
 * Semelhança 0–100 entre o título do ML e o de um fornecedor.
 * Combina cobertura das palavras do ML (o que o comprador procura) com as especificações numéricas.
 */
export function titleSimilarity(mlTitle: string, offerTitle: string): number {
  const a = new Set(titleTokens(mlTitle));
  const b = new Set(titleTokens(offerTitle));
  if (!a.size || !b.size) return 0;
  const words = [...a].filter((t) => !isSpec(t));
  const specs = [...a].filter(isSpec);
  const wordHit = words.length ? words.filter((t) => b.has(t)).length / words.length : 1;
  // especificação presente no ML mas com valor diferente na oferta derruba a nota
  const specHit = specs.length ? specs.filter((t) => b.has(t)).length / specs.length : 1;
  const offerSpecs = [...b].filter(isSpec);
  const conflict = specs.length > 0 && offerSpecs.length > 0 && specHit === 0;
  // sem medidas no título do ML, só as palavras contam (senão a parte de medidas daria pontos de graça)
  const base = specs.length ? wordHit * 0.7 + specHit * 0.3 : wordHit;
  const score = base * 100 * (conflict ? 0.5 : 1);
  return Math.round(score);
}

/**
 * Termo de busca para o fornecedor a partir do título do ML: sem marca no fim, sem detalhes
 * depois de vírgula/parênteses e no máximo 6 palavras significativas.
 */
export function searchQueryFromTitle(title: string): string {
  const head = title.split(/[,(|]/)[0] ?? title;
  return titleTokens(head).slice(0, 6).join(" ");
}
