export const brl = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v)
    ? "-"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits });

export const num = (v: number | null | undefined, digits = 0) =>
  v == null || !Number.isFinite(v) ? "-" : v.toLocaleString("pt-BR", { maximumFractionDigits: digits });

export const pct = (v: number | null | undefined, digits = 1) =>
  v == null || !Number.isFinite(v) ? "-" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;

export const dateBr = (v: string | Date | null | undefined) => {
  if (!v) return "-";
  const d = typeof v === "string" ? new Date(v.length === 10 ? `${v}T12:00:00` : v) : v;
  return d.toLocaleDateString("pt-BR");
};

export const formatCnpj = (v: string | null | undefined) => {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : (v ?? "");
};

/** Preço unitário de cotação: 2 a 4 casas (ex.: 3,20 / 0,1234). */
export const unitPrice = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "-" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
