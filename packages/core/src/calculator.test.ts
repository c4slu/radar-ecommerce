import { describe, expect, it } from "vitest";
import { calculateProfit, priceForTargetMargin } from "./calculator";

describe("calculateProfit", () => {
  it("reproduz a referência: R$ 47,99, Clássico 11,5%, custo 0, R$ 8,48 fixos", () => {
    const r = calculateProfit({ price: 47.99, cost: 0, feePct: 0.115, shipping: 8.48 });
    expect(r.lines.find((l) => l.key === "fee")!.amount).toBe(5.52);
    expect(r.sellingCosts).toBe(14);
    expect(r.profit).toBe(33.99);
    expect(r.margin).toBeCloseTo(0.7083, 4);
    expect(r.roi).toBeNull();
    expect(r.minPrice).toBe(9.59);
    expect(r.status).toBe("lucro");
  });

  it("soma impostos, publicidade e custos e calcula ROI", () => {
    const r = calculateProfit({ price: 100, cost: 40, feePct: 0.165, taxPct: 0.06, adsPct: 0.1, shipping: 12, packaging: 1.5 });
    // 16,50 + 6 + 10 + 12 + 1,50 = 46 de custos de venda; +40 de produto = 86
    expect(r.sellingCosts).toBe(46);
    expect(r.profit).toBe(14);
    expect(r.roi).toBeCloseTo(0.35);
    // (40 + 12 + 1,5) / (1 - 0,325) = 79,26; +1 centavo pelos arredondamentos de cada linha
    expect(r.minPrice).toBe(79.27);
    expect(calculateProfit({ price: r.minPrice!, cost: 40, feePct: 0.165, taxPct: 0.06, adsPct: 0.1, shipping: 12, packaging: 1.5 }).profit).toBeGreaterThanOrEqual(0);
  });

  it("prejuízo quando o preço não cobre", () => {
    expect(calculateProfit({ price: 30, cost: 28, feePct: 0.115 }).status).toBe("prejuizo");
  });

  it("preço para margem alvo", () => {
    const p = priceForTargetMargin({ cost: 40, feePct: 0.115, shipping: 10 }, 0.2)!;
    expect(calculateProfit({ price: p, cost: 40, feePct: 0.115, shipping: 10 }).margin).toBeCloseTo(0.2, 2);
  });
});

describe("arredondamento", () => {
  it("arredonda meio centavo para cima como o ML (145 x 11,5% = 16,675 -> 16,68)", () => {
    const r = calculateProfit({ price: 145, cost: 60, feePct: 0.115, shipping: 20 });
    expect(r.lines.find((l) => l.key === "fee")!.amount).toBe(16.68);
  });
});
