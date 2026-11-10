import { offerLandedCost, searchQueryFromTitle, titleSimilarity, type SourcingMode } from "@radar/core";
import { cjAdapter } from "./cj";
import { nationalAdapter } from "./national";
import type { SupplierAdapter, SupplierOffer } from "./types";

/** Fornecedores disponíveis. AliExpress e nacionais entram aqui quando houver acesso. */
export const ADAPTERS: SupplierAdapter[] = [nationalAdapter, cjAdapter];

export async function configuredAdapters(): Promise<SupplierAdapter[]> {
  const ok = await Promise.all(ADAPTERS.map((a) => Promise.resolve(a.configured()).catch(() => false)));
  return ADAPTERS.filter((_, i) => ok[i]);
}

export interface RankedOffer extends SupplierOffer {
  /** semelhança 0–100 com o produto procurado */
  matchScore: number;
  /** custo final por unidade em R$, ou null (importado no modo só nacional, sem câmbio...) */
  landedCost: number | null;
  costNote: "importado" | "sem_cambio" | "preco_invalido" | null;
}

export interface FindResult {
  query: string;
  offers: RankedOffer[];
  /** falhas por fornecedor (os outros continuam valendo) */
  errors: { source: string; message: string }[];
  searched: string[];
}

/** Nota mínima de semelhança para uma oferta aparecer como candidata. */
export const MIN_MATCH = 35;

export function rankOffers(
  title: string,
  offers: SupplierOffer[],
  opts: { fx: Record<string, number>; mode: SourcingMode; query?: string },
): RankedOffer[] {
  return offers
    .map((o) => {
      const c = offerLandedCost(o, { fx: opts.fx, mode: opts.mode });
      // vale a maior nota entre o título do ML e o termo pesquisado: o catálogo da CJ é em inglês,
      // então "thermal bottle 500ml" digitado pelo usuário precisa casar mesmo com o título em português
      const matchScore = o.exact ? 100 : Math.max(titleSimilarity(title, o.title), opts.query ? titleSimilarity(opts.query, o.title) : 0);
      return { ...o, matchScore, landedCost: c.cost, costNote: c.reason ?? null };
    })
    .filter((o) => o.matchScore >= MIN_MATCH)
    .sort(
      (a, b) =>
        // 1) ofertas que entram no custo (nacionais) primeiro, 2) mais parecidas, 3) mais baratas
        Number(b.landedCost != null) - Number(a.landedCost != null) ||
        Math.round(b.matchScore / 10) - Math.round(a.matchScore / 10) ||
        (a.landedCost ?? a.unitPrice) - (b.landedCost ?? b.unitPrice),
    );
}

/** Busca o produto (pelo título do ML) em todos os fornecedores configurados e ranqueia. */
export async function findSupplierOffers(
  title: string,
  opts: { fx: Record<string, number>; mode: SourcingMode; limit?: number; query?: string; brand?: string | null; model?: string | null },
): Promise<FindResult> {
  const query = opts.query?.trim() || searchQueryFromTitle(title);
  const adapters = await configuredAdapters();
  const errors: FindResult["errors"] = [];
  const all = await Promise.all(
    adapters.map((a) =>
      a.search(query, { limit: opts.limit ?? 20, brand: opts.brand, model: opts.model }).catch((err: Error) => {
        errors.push({ source: a.name, message: err.message });
        return [] as SupplierOffer[];
      }),
    ),
  );
  return { query, offers: rankOffers(title, all.flat(), { ...opts, query }), errors, searched: adapters.map((a) => a.name) };
}
