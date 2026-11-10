import { describe, expect, it } from "vitest";
import { mapCjProduct, parseCjPrice } from "./cj";
import { rankOffers } from "./match";

// formato do item de /product/listV2 conforme a documentação da CJ (API 2.0)
const cjItem = {
  id: "1234-ABCD",
  nameEn: "Stainless Steel Thermal Bottle 500ml",
  sku: "CJXX123",
  bigImage: "https://cf.cjdropshipping.com/x.jpg",
  sellPrice: "4.20 -- 6.10",
  nowPrice: "",
  warehouseInventoryNum: 230,
  directMinOrderNum: 1,
};

describe("CJ", () => {
  it("lê preço simples, faixa e número", () => {
    expect(parseCjPrice("11.85")).toBe(11.85);
    expect(parseCjPrice("2.10 -- 4.50")).toBe(2.1);
    expect(parseCjPrice(3.2)).toBe(3.2);
    expect(parseCjPrice("")).toBeNaN();
  });
  it("normaliza o item da busca", () => {
    const o = mapCjProduct(cjItem, "BR");
    expect(o).toMatchObject({ source: "cj", externalId: "1234-ABCD", unitPrice: 4.2, priceMax: 6.1, currency: "USD", shipFrom: "BR", stock: 230, moq: 1 });
  });
});

describe("rankOffers", () => {
  const base = mapCjProduct(cjItem, "BR");
  const offers = [
    { ...base, externalId: "cn-barata", title: "Thermal bottle stainless steel 500ml", unitPrice: 2, shipFrom: "CN" },
    { ...base, externalId: "br-cara", title: "Garrafa termica inox 500ml", unitPrice: 6, shipFrom: "BR", currency: "USD" },
    { ...base, externalId: "br-barata", title: "Garrafa térmica inox 500ml tampa", unitPrice: 4, shipFrom: "BR", currency: "USD" },
    { ...base, externalId: "outra", title: "Fone bluetooth capacete", unitPrice: 1, shipFrom: "BR" },
  ];

  it("só nacional entra no custo; nacionais primeiro e a mais barata antes; descarta produto diferente", () => {
    const r = rankOffers("Garrafa Térmica Inox 500ml", offers, { fx: { USD: 5 }, mode: "nacional" });
    expect(r.map((o) => o.externalId)).toEqual(["br-barata", "br-cara"]);
    expect(r[0]!.landedCost).toBe(20);
  });

  it("título em inglês do fornecedor ainda casa quando há medida igual (fica como importado)", () => {
    const r = rankOffers("Garrafa Térmica Inox 500ml", offers, { fx: { USD: 5 }, mode: "importacao" });
    // no modo importação a oferta da China entra no custo
    expect(r.find((o) => o.externalId === "br-barata")!.landedCost).toBe(20);
  });
});

describe("busca em inglês", () => {
  it("o termo pesquisado em inglês faz a oferta da CJ casar com produto de título em português", () => {
    const o = { ...mapCjProduct(cjItem, "BR"), title: "Stainless Steel Thermal Bottle 500ml" };
    expect(rankOffers("Garrafa Térmica Inox 500ml", [o], { fx: { USD: 5 }, mode: "nacional" })).toHaveLength(0);
    const r = rankOffers("Garrafa Térmica Inox 500ml", [o], { fx: { USD: 5 }, mode: "nacional", query: "thermal bottle 500ml" });
    expect(r).toHaveLength(1);
    expect(r[0]!.matchScore).toBe(100);
  });
});
