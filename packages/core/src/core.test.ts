import { describe, expect, it } from "vitest";
import {
  computeRisk,
  landedCost,
  linearSlope,
  median,
  pickFeeRule,
  priceForMargin,
  quoteLandedCost,
  saleBreakdown,
  type FeeRule,
} from "./index";

// Regras ilustrativas (os valores reais ficam na tabela marketplace_fees)
const rules: FeeRule[] = [
  { marketplace: "mercadolivre", commissionPct: 0.12, fixedFee: 6.75, minPrice: 0, maxPrice: 79 },
  { marketplace: "mercadolivre", commissionPct: 0.12, fixedFee: 0, minPrice: 79, maxPrice: null },
  { marketplace: "mercadolivre", categoryId: "MLB1000", commissionPct: 0.16, fixedFee: 0, minPrice: 79 },
];

describe("stats", () => {
  it("median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNaN();
  });
  it("linearSlope", () => {
    expect(linearSlope([0, 1, 2, 3].map((x) => ({ x, y: 10 - 2 * x })))).toBeCloseTo(-2);
  });
});

describe("fees", () => {
  it("prefere regra da categoria e respeita faixa de preço", () => {
    expect(pickFeeRule(rules, "mercadolivre", 50)?.fixedFee).toBe(6.75);
    expect(pickFeeRule(rules, "mercadolivre", 100)?.commissionPct).toBe(0.12);
    expect(pickFeeRule(rules, "mercadolivre", 100, "MLB1000")?.commissionPct).toBe(0.16);
    expect(pickFeeRule(rules, "shopee", 100)).toBeUndefined();
  });
});

describe("margin", () => {
  it("landedCost rateia frete e impostos", () => {
    expect(landedCost({ unitPrice: 10, quantity: 100, freightTotal: 200, otherCostsTotal: 100 })).toBe(13);
  });

  it("quoteLandedCost converte moeda e rateia custos", () => {
    expect(quoteLandedCost({ unitPrice: 2, currency: "USD", fxRate: 5, quantity: 100, freightTotal: 300 })).toBe(13);
    expect(quoteLandedCost({ unitPrice: 10, currency: "BRL", freightTotal: 50 })).toBe(60);
    expect(quoteLandedCost({ unitPrice: 2, currency: "USD" })).toBeNull();
  });

  it("saleBreakdown", () => {
    const b = saleBreakdown(100, { marketplace: "mercadolivre", feeRules: rules, landedCost: 50, taxPct: 0.06 });
    expect(b.fee).toBeCloseTo(12);
    expect(b.tax).toBeCloseTo(6);
    expect(b.profit).toBeCloseTo(32);
    expect(b.marginPct).toBeCloseTo(0.32);
  });

  it("priceForMargin usa a regra válida para o preço resultante", () => {
    const ctx = { marketplace: "mercadolivre" as const, feeRules: rules, landedCost: 50, taxPct: 0.06 };
    // break-even na faixa < 79 (com tarifa fixa): 56.75 / 0.82
    const be = priceForMargin(0, ctx)!;
    expect(be).toBeCloseTo(69.21, 2);
    expect(saleBreakdown(be, ctx).profit).toBeCloseTo(0, 1);
    // margem de 20% cai na faixa >= 79: 50 / 0.62
    expect(priceForMargin(0.2, ctx)).toBeCloseTo(80.65, 2);
  });
});

describe("risk", () => {
  const base = { marketplace: "mercadolivre" as const, feeRules: rules, taxPct: 0.06 };

  it("produto saudável -> risco baixo", () => {
    const r = computeRisk({
      ...base,
      landedCost: 30,
      marketPrices: [95, 100, 100, 105, 110],
      medianHistory: Array.from({ length: 30 }, (_, day) => ({ day, median: 100 + (day % 2) })),
      sellerCountHistory: [8, 8, 8],
      marketDailySales: 40,
      lotQty: 60,
      expectedShare: 0.1,
    });
    expect(r.level).toBe("baixo");
    expect(r.estimatedDaysToSell).toBe(15);
    expect(r.recommendedLotQty).toBe(120);
    expect(r.capitalAtRisk).toBe(1800);
    expect(r.suggestedPrice).toBe(98);
  });

  it("margem negativa, preço caindo e giro lento -> risco alto", () => {
    const r = computeRisk({
      ...base,
      landedCost: 85,
      marketPrices: [100, 100, 100],
      medianHistory: Array.from({ length: 30 }, (_, day) => ({ day, median: 110 - day })),
      sellerCountHistory: [50, 100, 150],
      officialSellerShare: 0.5,
      marketDailySales: 2,
      lotQty: 100,
      expectedShare: 0.05,
    });
    expect(r.level).toBe("alto");
    expect(r.score).toBeGreaterThan(85);
    expect(r.components.find((c) => c.key === "margin")!.risk).toBe(100);
    expect(r.explanation.some((e) => e.includes("acima da mediana"))).toBe(true);
  });

  it("sem dados de mercado usa valor neutro e avisa", () => {
    const r = computeRisk({ ...base, landedCost: 30, marketPrices: [], lotQty: 10, expectedShare: 0.1 });
    expect(r.score).toBe(50);
    expect(r.components.every((c) => c.missingData)).toBe(true);
    expect(r.explanation[0]).toMatch(/dados faltando/);
  });
});

describe("parseLocaleNumber", () => {
  it("entende formato brasileiro e americano", async () => {
    const { parseLocaleNumber: p } = await import("./parse");
    expect(p("1.200")).toBe(1200);
    expect(p("1.200.000")).toBe(1200000);
    expect(p("1.234,56")).toBe(1234.56);
    expect(p("3,20")).toBe(3.2);
    expect(p("3.20")).toBe(3.2);
    expect(p("0.5")).toBe(0.5);
    expect(p("R$ 15")).toBe(15);
    expect(p("12,5%")).toBe(12.5);
    expect(p("-1.000")).toBe(-1000);
    expect(p("")).toBeUndefined();
    expect(p("abc")).toBeNaN();
  });
});
