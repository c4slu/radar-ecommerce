import { PageHeader } from "@/components/ui";
import { saveSupplier } from "../actions";
import { SupplierForm } from "../supplier-form";

export default function NewSupplierPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Novo fornecedor" subtitle="Digite o CNPJ e clique em Consultar para preencher os dados da Receita." />
      <div className="card">
        <SupplierForm action={saveSupplier.bind(null, null)} />
      </div>
    </div>
  );
}
