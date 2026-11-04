import type { products } from "@radar/db/schema";
import { ActionForm } from "@/components/action-form";
import { Field, SelectField, TextArea } from "@/components/ui";
import type { ActionState } from "@/lib/forms";

type Product = typeof products.$inferSelect;

export const STATUS_OPTIONS = [
  { value: "pesquisa", label: "Em pesquisa" },
  { value: "aprovado", label: "Aprovado para compra" },
  { value: "ativo", label: "Ativo (vendendo)" },
  { value: "descontinuado", label: "Descontinuado" },
];

export function ProductForm({
  product,
  action,
}: {
  product?: Product;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <Field label="SKU *" name="sku" required defaultValue={product?.sku} placeholder="GARRAFA-500" />
        <Field label="Nome *" name="name" required defaultValue={product?.name} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Status" name="status" defaultValue={product?.status ?? "pesquisa"} options={STATUS_OPTIONS} />
        <Field label="Categoria" name="category" defaultValue={product?.category ?? ""} />
        <Field label="Categoria no ML" name="mlCategoryId" defaultValue={product?.mlCategoryId ?? ""} placeholder="MLB1234" hint="Usada para tarifas por categoria" />
      </div>
      <Field
        label="Termos de busca para monitorar"
        name="searchTerms"
        defaultValue={product?.searchTerms.join(", ") ?? ""}
        placeholder="garrafa térmica 500ml, garrafa inox"
        hint="Separados por vírgula. Os coletores usam esses termos para achar concorrentes."
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Peso (g)" name="weightGrams" inputMode="numeric" defaultValue={product?.weightGrams ?? ""} />
        <Field label="Comprimento (cm)" name="lengthCm" inputMode="decimal" defaultValue={product?.lengthCm ?? ""} />
        <Field label="Largura (cm)" name="widthCm" inputMode="decimal" defaultValue={product?.widthCm ?? ""} />
        <Field label="Altura (cm)" name="heightCm" inputMode="decimal" defaultValue={product?.heightCm ?? ""} />
      </div>
      <TextArea label="Observações" name="notes" defaultValue={product?.notes ?? ""} />
    </ActionForm>
  );
}
