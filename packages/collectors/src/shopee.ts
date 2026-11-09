import { collectShopeeListings, shopeeConfigured } from "@radar/shopee";
import { isDryRun, runJob } from "./lib/job";

await runJob("collect-shopee", async () => {
  if (!shopeeConfigured()) throw new Error("Shopee não configurada: defina SHOPEE_APP_ID e SHOPEE_APP_SECRET.");
  if (isDryRun) {
    const { searchShopee } = await import("@radar/shopee");
    const r = await searchShopee("garrafa térmica", 5);
    console.table(r.listings.map((l) => ({ titulo: l.title.slice(0, 50), preco: l.price, vendidos: l.soldQuantity, loja: l.sellerName })));
    return r.listings.length;
  }
  const r = await collectShopeeListings();
  console.log(`[collect-shopee] ${r.products} produtos, ${r.listings} anúncios`);
  if (r.errors.length) throw new Error(`${r.listings} anúncios gravados, mas com falhas:\n${r.errors.join("\n")}`);
  return r.listings;
});
