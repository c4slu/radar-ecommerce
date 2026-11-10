"use client";

import { SupplierPanel } from "../../calculadora/supplier-panel";
import { addQuoteFromOffer } from "../actions";

/** Busca de fornecedores na página do produto: cada oferta vira cotação em um clique. */
export function ProductSupplierSearch({ productId, title }: { productId: string; title: string }) {
  return (
    <SupplierPanel
      title={title}
      catalogId={null}
      confirmedId={null}
      actionLabel="Adicionar como cotação"
      onAction={(offer) => addQuoteFromOffer(productId, offer)}
    />
  );
}
