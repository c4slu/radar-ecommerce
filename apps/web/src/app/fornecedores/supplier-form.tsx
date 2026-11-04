"use client";

import { useState, useTransition } from "react";
import type { suppliers } from "@radar/db/schema";
import { ActionForm } from "@/components/action-form";
import { Badge, Field, SelectField, TextArea } from "@/components/ui";
import type { ActionState } from "@/lib/forms";
import { lookupCnpj, type CnpjLookup } from "./actions";

type Supplier = typeof suppliers.$inferSelect;

export function SupplierForm({
  supplier,
  action,
}: {
  supplier?: Supplier;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const [v, setV] = useState({
    name: supplier?.name ?? "",
    cnpj: supplier?.cnpj ?? "",
    city: supplier?.city ?? "",
    state: supplier?.state ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
  });
  const [info, setInfo] = useState<CnpjLookup | null>(null);
  const [pending, start] = useTransition();
  const bind = (k: keyof typeof v) => ({
    value: v[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value })),
  });

  const consult = () =>
    start(async () => {
      const r = await lookupCnpj(v.cnpj);
      setInfo(r);
      if (r.error) return;
      setV((s) => ({
        ...s,
        name: s.name || r.name || "",
        city: r.city ?? s.city,
        state: r.state ?? s.state,
        phone: s.phone || r.phone || "",
        email: s.email || r.email || "",
      }));
    });

  return (
    <ActionForm action={action}>
      <div className="flex items-end gap-2">
        <Field label="CNPJ" name="cnpj" placeholder="00.000.000/0000-00" className="flex-1" {...bind("cnpj")} />
        <button type="button" onClick={consult} disabled={pending || !v.cnpj} className="btn mb-px disabled:opacity-50">
          {pending ? "Consultando..." : "Consultar"}
        </button>
      </div>
      {info && (
        <div className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          {info.error ? (
            <span className="text-red-600">{info.error}</span>
          ) : (
            <div className="space-y-1">
              <div>
                <Badge tone={info.status === "ATIVA" ? "green" : "red"}>Situação: {info.status ?? "?"}</Badge>
              </div>
              <div className="text-zinc-500">{info.tradeName}</div>
              <div className="text-zinc-500">
                {info.activity} {info.openedAt && `· aberta em ${info.openedAt.split("-").reverse().join("/")}`}
              </div>
            </div>
          )}
        </div>
      )}

      <Field label="Nome *" name="name" required {...bind("name")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Canal"
          name="channel"
          defaultValue={supplier?.channel ?? "nacional"}
          options={[
            { value: "nacional", label: "Nacional" },
            { value: "importacao", label: "Importação" },
          ]}
        />
        <Field label="Contato" name="contactName" defaultValue={supplier?.contactName ?? ""} />
        <Field label="Telefone / WhatsApp" name="phone" {...bind("phone")} />
        <Field label="E-mail" name="email" type="email" {...bind("email")} />
        <Field label="Cidade" name="city" {...bind("city")} />
        <Field label="UF" name="state" maxLength={2} {...bind("state")} />
        <Field label="Site / loja" name="website" defaultValue={supplier?.website ?? ""} />
        <Field label="Prazo de entrega (dias)" name="leadTimeDays" inputMode="numeric" defaultValue={supplier?.leadTimeDays ?? ""} />
        <Field label="Pedido mínimo (R$)" name="minOrderValue" inputMode="decimal" defaultValue={supplier?.minOrderValue ?? ""} />
        <Field label="Nota (1 a 5)" name="rating" inputMode="numeric" defaultValue={supplier?.rating ?? ""} />
      </div>
      <TextArea label="Observações" name="notes" defaultValue={supplier?.notes ?? ""} />
    </ActionForm>
  );
}
