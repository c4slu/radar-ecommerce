"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, suppliers } from "@radar/db";
import { requireUser } from "@/lib/auth";
import { isValidCnpj, onlyDigits } from "@/lib/cnpj";
import { firstError, formObject, zIntOpt, zNumOpt, type ActionState } from "@/lib/forms";

const schema = z.object({
  name: z.string({ error: "Informe o nome" }).min(2, "Nome muito curto"),
  cnpj: z
    .string()
    .optional()
    .transform((v) => (v ? onlyDigits(v) : undefined))
    .refine((v) => !v || isValidCnpj(v), "CNPJ inválido"),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.email("E-mail inválido").optional(),
  website: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2, "Use a sigla da UF").optional(),
  channel: z.enum(["nacional", "importacao"]),
  leadTimeDays: zIntOpt(),
  minOrderValue: zNumOpt(),
  rating: zIntOpt().refine((v) => v == null || (v >= 1 && v <= 5), "Nota de 1 a 5"),
  notes: z.string().optional(),
});

export async function saveSupplier(id: string | null, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = schema.safeParse(formObject(fd));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const data = { ...parsed.data, state: parsed.data.state?.toUpperCase() };
  const db = getDb();
  if (id) {
    await db.update(suppliers).set(data).where(eq(suppliers.id, id));
    revalidatePath("/fornecedores");
    return { ok: "Fornecedor atualizado" };
  }
  const [row] = await db.insert(suppliers).values(data).returning({ id: suppliers.id });
  revalidatePath("/fornecedores");
  redirect(`/fornecedores/${row!.id}`);
}

export async function deleteSupplier(id: string) {
  await requireUser();
  await getDb().delete(suppliers).where(eq(suppliers.id, id));
  revalidatePath("/fornecedores");
  redirect("/fornecedores");
}

export interface CnpjLookup {
  error?: string;
  name?: string;
  tradeName?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  status?: string;
  activity?: string;
  openedAt?: string;
}

/** Consulta pública na BrasilAPI (gratuita, sem chave). */
export async function lookupCnpj(cnpj: string): Promise<CnpjLookup> {
  await requireUser();
  const digits = onlyDigits(cnpj);
  if (!isValidCnpj(digits)) return { error: "CNPJ inválido" };
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      // a BrasilAPI responde 403 para requisições sem User-Agent
      headers: { "User-Agent": "radar-app/0.1 (uso interno)", Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (res.status === 404) return { error: "CNPJ não encontrado na Receita" };
    if (!res.ok) return { error: `BrasilAPI respondeu ${res.status}` };
    const j = (await res.json()) as Record<string, unknown>;
    const s = (k: string) => (typeof j[k] === "string" && j[k] ? (j[k] as string) : undefined);
    const ddd = s("ddd_telefone_1");
    return {
      name: s("nome_fantasia") ?? s("razao_social"),
      tradeName: s("razao_social"),
      city: s("municipio"),
      state: s("uf"),
      phone: ddd ? ddd.replace(/^(\d{2})(\d+)$/, "($1) $2") : undefined,
      email: s("email")?.toLowerCase(),
      status: s("descricao_situacao_cadastral"),
      activity: s("cnae_fiscal_descricao"),
      openedAt: s("data_inicio_atividade"),
    };
  } catch (err) {
    return { error: `Falha ao consultar: ${(err as Error).message}` };
  }
}
