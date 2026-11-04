import { PageHeader } from "@/components/ui";
import { saveProduct } from "../actions";
import { ProductForm } from "../product-form";

export default function NewProductPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Novo produto" subtitle="Depois de salvar você poderá adicionar cotações de fornecedores." />
      <div className="card">
        <ProductForm action={saveProduct.bind(null, null)} />
      </div>
    </div>
  );
}
