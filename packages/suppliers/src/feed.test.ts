import { describe, expect, it } from "vitest";
import { detectFormat, parseFeed, parseFeedPrice } from "./feed";

const GOOGLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>
<title>Atacado Exemplo</title>
<item>
  <g:id>SKU-001</g:id>
  <title><![CDATA[Garrafa Térmica Inox 500ml Preta]]></title>
  <link>https://fornecedor.exemplo/p/sku-001</link>
  <g:image_link>https://fornecedor.exemplo/img/1.jpg</g:image_link>
  <g:price>39,90 BRL</g:price>
  <g:sale_price>34.90 BRL</g:sale_price>
  <g:availability>in stock</g:availability>
  <g:quantity>120</g:quantity>
  <g:brand>Térmix</g:brand>
  <g:mpn>TX-500</g:mpn>
  <g:gtin>7891234567895</g:gtin>
</item>
<item>
  <g:id>SKU-002</g:id>
  <g:title>Pano Multiuso Microfibra Kit 10 &amp; Brinde</g:title>
  <g:price>R$ 59,90</g:price>
  <g:availability>out of stock</g:availability>
</item>
<item><g:id>SEM-PRECO</g:id><title>Produto sem preço</title></item>
</channel></rss>`;

const PT_XML = `<produtos>
  <produto><codigo>A1</codigo><nome>Suporte Celular Veicular</nome><preco>19,90</preco><estoque>0</estoque><marca>Fixa</marca></produto>
  <produto><codigo>A2</codigo><nome>Fone Bluetooth Capacete</nome><preco>89.00</preco><estoque>15</estoque><imagens><imagem>https://x/2.jpg</imagem></imagens></produto>
</produtos>`;

const CSV = `﻿Código;Nome;Preço;Estoque;Marca;Modelo;EAN
B1;"Colete Salva Vidas Infantil; tamanho P";49,90;8;Nautika;CSV-P;789000000001
B2;Lona Plástica 4x3;35,00;0;;;`;

describe("parseFeedPrice", () => {
  it("entende moeda no fim, R$ e vírgula", () => {
    expect(parseFeedPrice("39,90 BRL")).toBe(39.9);
    expect(parseFeedPrice("R$ 1.299,00")).toBe(1299);
    expect(parseFeedPrice("34.90 BRL")).toBe(34.9);
    expect(parseFeedPrice("")).toBeNull();
  });
});

describe("parseFeed", () => {
  it("XML do Google Merchant", () => {
    const items = parseFeed(GOOGLE_XML);
    expect(detectFormat(GOOGLE_XML)).toBe("xml");
    expect(items).toHaveLength(2); // o sem preço é ignorado
    expect(items[0]).toMatchObject({
      externalId: "SKU-001",
      title: "Garrafa Térmica Inox 500ml Preta",
      price: 39.9,
      salePrice: 34.9,
      stock: 120,
      available: true,
      brand: "Térmix",
      model: "TX-500",
      gtin: "7891234567895",
      imageUrl: "https://fornecedor.exemplo/img/1.jpg",
    });
    expect(items[1]).toMatchObject({ title: "Pano Multiuso Microfibra Kit 10 & Brinde", price: 59.9, available: false });
  });

  it("XML de produtos em português, com tags aninhadas", () => {
    const items = parseFeed(PT_XML);
    expect(items.map((i) => i.externalId)).toEqual(["A1", "A2"]);
    expect(items[0]).toMatchObject({ price: 19.9, stock: 0, available: false, brand: "Fixa" });
    expect(items[1]).toMatchObject({ price: 89, stock: 15, available: true, imageUrl: "https://x/2.jpg" });
  });

  it("CSV com ponto e vírgula, acentos no cabeçalho e aspas", () => {
    const items = parseFeed(CSV);
    expect(detectFormat(CSV)).toBe("csv");
    expect(items[0]).toMatchObject({ externalId: "B1", title: "Colete Salva Vidas Infantil; tamanho P", price: 49.9, stock: 8, model: "CSV-P", gtin: "789000000001" });
    expect(items[1]).toMatchObject({ externalId: "B2", price: 35, available: false, brand: null });
  });
});
