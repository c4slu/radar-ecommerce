/** Oferta de um fornecedor, normalizada (igual para CJ, AliExpress e nacionais). */
export interface SupplierOffer {
  /** id do adaptador: "cj", "aliexpress", "dslite"... */
  source: string;
  sourceName: string;
  externalId: string;
  title: string;
  imageUrl: string | null;
  url: string | null;
  /** preço unitário na moeda da oferta */
  unitPrice: number;
  /** maior preço quando a oferta tem variações com preços diferentes (unitPrice = o menor) */
  priceMax: number | null;
  currency: string;
  /** país de onde é enviada (ISO). null = desconhecido */
  shipFrom: string | null;
  /** frete por unidade até o cliente/você, na moeda da oferta, quando conhecido */
  shippingPerUnit: number | null;
  shippingDays: string | null;
  stock: number | null;
  /** pedido mínimo */
  moq: number | null;
  /** marca e modelo batem exatamente com o produto procurado */
  exact?: boolean;
}

export interface SearchOptions {
  limit?: number;
  /** só ofertas com estoque neste país (ex.: "BR") */
  shipFrom?: string;
  /** marca e modelo do produto (catálogo do ML): permitem vínculo exato com catálogos que os trazem */
  brand?: string | null;
  model?: string | null;
}

export interface SupplierAdapter {
  id: string;
  name: string;
  /** credenciais/catálogos disponíveis (pode consultar o banco) */
  configured(): boolean | Promise<boolean>;
  search(query: string, opts?: SearchOptions): Promise<SupplierOffer[]>;
}

export class SupplierError extends Error {
  constructor(
    message: string,
    public source: string,
    public code?: number | string,
  ) {
    super(message);
  }
}
