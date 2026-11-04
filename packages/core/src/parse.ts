/**
 * Converte número digitado no formato brasileiro ou americano:
 *   "1.234,56" -> 1234.56   "1.200" -> 1200   "1.200.000" -> 1200000
 *   "3,20" -> 3.2           "3.20" -> 3.2     "R$ 15" -> 15     "12,5%" -> 12.5
 * Ponto seguido só de grupos de 3 dígitos (sem vírgula) é separador de milhar.
 * Retorna undefined para vazio e NaN para texto inválido.
 */
export function parseLocaleNumber(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return v;
  let s = String(v).replace(/[R$\s%]/g, "");
  if (s === "") return undefined;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
