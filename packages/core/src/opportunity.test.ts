import { describe, expect, it } from "vitest";
import { computeOpportunity, type OpportunityInput } from "./opportunity";

const base: OpportunityInput = {
  position: 1,
  positionHistory: Array.from({ length: 14 }, (_, day) => ({ day, position: 1 })),
  daysInTop: 14,
  categoriesCount: 1,
  listings: 2,
  listingsWeekAgo: 2,
  fullShare: 0,
  officialShare: 0,
  priceMin: 45,
  priceMedian: 50,
  priceMax: 60,
  catalogAgeDays: 400,
};

describe("computeOpportunity", () => {
  it("top 1 com 2 anúncios é oportunidade forte", () => {
    const r = computeOpportunity(base);
    expect(r.level).toBe("forte");
    expect(r.badges.map((b) => b.text)).toEqual(expect.arrayContaining(["Top 1 da categoria", "Só 2 anúncios", "Sem Full"]));
  });

  it("posição 1 com 2 anúncios vence posição 15 com 40 anúncios", () => {
    const crowded = computeOpportunity({
      ...base,
      position: 15,
      positionHistory: [{ day: 0, position: 15 }],
      daysInTop: 1,
      listings: 40,
      listingsWeekAgo: 30,
      fullShare: 0.6,
      officialShare: 0.5,
    });
    expect(computeOpportunity(base).score).toBeGreaterThan(crowded.score + 30);
    expect(crowded.level).toBe("fraca");
    expect(crowded.badges.map((b) => b.text)).toContain("40 anúncios");
  });

  it("detecta subida no ranking", () => {
    const rising = computeOpportunity({
      ...base,
      position: 3,
      positionHistory: [12, 10, 8, 6, 5, 3].map((position, day) => ({ day, position })),
      daysInTop: 6,
    });
    expect(rising.positionChange).toBe(9);
    expect(rising.badges.map((b) => b.text)).toContain("Subindo +9 posições");
  });

  it("ticket fora da faixa preferida perde pontos de preço", () => {
    const cheap = computeOpportunity({ ...base, priceMin: 8, priceMedian: 9, priceMax: 10 });
    expect(cheap.parts.price).toBeLessThan(computeOpportunity(base).parts.price);
    expect(cheap.badges.map((b) => b.text)).toContain("Fora da sua faixa de preço");
  });
});
