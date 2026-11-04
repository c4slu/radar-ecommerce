import { z } from "zod";
import { parseLocaleNumber } from "@radar/core";

/** Converte FormData em objeto, tratando "" como undefined. */
export function formObject(fd: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    out[k] = t === "" ? undefined : t;
  }
  return out;
}

/** Número em formato brasileiro ou americano (ver parseLocaleNumber no core). */
export const parseNumber = parseLocaleNumber;

export const zNum = () => z.preprocess(parseNumber, z.number({ error: "Número inválido" }));
export const zNumOpt = () => z.preprocess(parseNumber, z.number({ error: "Número inválido" }).optional());
export const zInt = () => z.preprocess(parseNumber, z.number({ error: "Número inválido" }).int("Use um número inteiro"));
export const zIntOpt = () =>
  z.preprocess(parseNumber, z.number({ error: "Número inválido" }).int("Use um número inteiro").optional());
/** Percentual digitado (ex.: 12,5) -> fração (0.125) */
export const zPct = () => zNum().transform((v) => v / 100);
export const zPctOpt = () => zNumOpt().transform((v) => (v == null ? undefined : v / 100));

export type ActionState = { error?: string; ok?: string } | undefined;

export function firstError(err: z.ZodError) {
  const issue = err.issues[0];
  return issue ? `${issue.path.join(".") || "campo"}: ${issue.message}` : "Dados inválidos";
}
