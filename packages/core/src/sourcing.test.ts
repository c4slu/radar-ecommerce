import { describe, expect, it } from "vitest";
import { offerLandedCost, searchQueryFromTitle, titleSimilarity, titleTokens } from "./sourcing";

const fx = { USD: 5.5, CNY: 0.8 };

describe("offerLandedCost", () => {
  it("oferta nacional em dólar: converte preço + frete", () => {
    expect(offerLandedCost({ unitPrice: 10, currency: "USD", shipFrom: "BR", shippingPerUnit: 2 }, { fx, mode: "nacional" })).toEqual({ cost: 66 });
  });
  it("oferta em real não precisa de câmbio", () => {
    expect(offerLandedCost({ unitPrice: 30, currency: "BRL", shipFrom: "BR" }, { fx: {}, mode: "nacional" })).toEqual({ cost: 30 });
  });
  it("no modo só nacional, oferta da China fica fora do custo", () => {
    expect(offerLandedCost({ unitPrice: 3, currency: "USD", shipFrom: "CN" }, { fx, mode: "nacional" })).toEqual({ cost: null, reason: "importado" });
  });
  it("no modo importação, entra no custo", () => {
    expect(offerLandedCost({ unitPrice: 3, currency: "USD", shipFrom: "CN" }, { fx, mode: "importacao" }).cost).toBe(16.5);
  });
  it("sem câmbio da moeda", () => {
    expect(offerLandedCost({ unitPrice: 3, currency: "EUR", shipFrom: "BR" }, { fx, mode: "nacional" }).reason).toBe("sem_cambio");
  });
});

describe("semelhança de títulos", () => {
  it("normaliza acentos e junta número com unidade", () => {
    expect(titleTokens("Garrafa Térmica 500 ml Inox")).toEqual(["garrafa", "termica", "500ml", "inox"]);
  });
  it("mesmo produto com palavras em outra ordem pontua alto", () => {
    expect(titleSimilarity("Kit 10 Pano Multiuso Reutilizável Lavável", "Pano multiuso lavável reutilizável kit com 10")).toBeGreaterThanOrEqual(85);
  });
  it("medida diferente derruba a nota", () => {
    const certo = titleSimilarity("Garrafa Térmica Inox 500ml", "Garrafa termica inox 500ml");
    const errado = titleSimilarity("Garrafa Térmica Inox 500ml", "Garrafa termica inox 1000ml");
    expect(certo).toBe(100);
    expect(errado).toBeLessThan(40);
  });
  it("produto diferente pontua baixo", () => {
    expect(titleSimilarity("Fone Bluetooth para Capacete de Moto", "Garrafa térmica inox")).toBeLessThan(20);
  });
  it("termo de busca curto a partir do título do ML", () => {
    expect(searchQueryFromTitle("Kit 10 Pano Multiuso Reutilizável Toalha Lavável Picotado, Cor Branco")).toBe("10 pano multiuso reutilizavel toalha lavavel");
  });
});
