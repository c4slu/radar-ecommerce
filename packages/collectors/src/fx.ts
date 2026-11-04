import { sql } from "drizzle-orm";
import { fxRates, getDb } from "@radar/db";
import { fetchJson, isDryRun, runJob } from "./lib/job";

/**
 * Câmbio sem chave de API:
 *  - USD-BRL: PTAX do Banco Central (cotação oficial). Fallback: Frankfurter.
 *  - CNY-BRL: o PTAX não tem yuan, então usa a taxa cruzada USD-BRL / USD-CNY (Frankfurter, dados do BCE).
 * (A AwesomeAPI foi descartada: devolve 429 nos IPs compartilhados do GitHub Actions.)
 */

type PtaxResponse = { value: { cotacaoVenda: number; dataHoraCotacao: string; tipoBoletim: string }[] };
type FrankfurterResponse = { date: string; rates: Record<string, number> };

const fmtBcb = (d: Date) =>
  `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${d.getFullYear()}`;

async function ptaxUsd(): Promise<{ rate: number; day: string } | null> {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 86_400_000); // cobre fins de semana e feriados
  const url =
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/" +
    "CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)" +
    `?@moeda='USD'&@dataInicial='${fmtBcb(start)}'&@dataFinalCotacao='${fmtBcb(end)}'` +
    "&$format=json&$select=cotacaoVenda,dataHoraCotacao,tipoBoletim";
  try {
    const { value } = await fetchJson<PtaxResponse>(url);
    const last = value.at(-1); // ordenado por data/hora; o último é o boletim mais recente
    return last ? { rate: last.cotacaoVenda, day: last.dataHoraCotacao.slice(0, 10) } : null;
  } catch (err) {
    console.warn("[collect-fx] PTAX indisponível, usando Frankfurter:", (err as Error).message);
    return null;
  }
}

await runJob("collect-fx", async () => {
  const ff = await fetchJson<FrankfurterResponse>("https://api.frankfurter.dev/v1/latest?base=USD&symbols=BRL,CNY");
  const usdCny = ff.rates.CNY;
  const ptax = await ptaxUsd();
  const usd = ptax ?? (ff.rates.BRL ? { rate: ff.rates.BRL, day: ff.date } : null);
  if (!usd || !usdCny) throw new Error(`cotações incompletas: ${JSON.stringify({ ptax, ff })}`);

  const rows = [
    { pair: "USD-BRL", rate: usd.rate, day: usd.day },
    { pair: "CNY-BRL", rate: Math.round((usd.rate / usdCny) * 1e6) / 1e6, day: ff.date },
  ];
  if (isDryRun) {
    console.table(rows);
    return rows.length;
  }
  await getDb()
    .insert(fxRates)
    .values(rows)
    .onConflictDoUpdate({ target: [fxRates.pair, fxRates.day], set: { rate: sql`excluded.rate` } });
  return rows.length;
});
