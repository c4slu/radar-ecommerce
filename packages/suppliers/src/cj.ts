import { eq } from "drizzle-orm";
import { getDb, integrationTokens } from "@radar/db";
import { SupplierError, type SearchOptions, type SupplierAdapter, type SupplierOffer } from "./types";

/**
 * CJ Dropshipping — API 2.0 (developers.cjdropshipping.com).
 * Credencial: CJ_API_KEY (My CJ > API). O access token vale 180 dias e fica em integration_tokens.
 * Limites: token 1 req/s; demais endpoints 1–6 req/s conforme o nível da conta (429 / 1600200).
 */
const BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const PROVIDER = "cj";
const MIN_INTERVAL_MS = 1100; // 1 req/s: o mínimo de qualquer nível de conta

interface Envelope<T> {
  code: number;
  result: boolean;
  message: string;
  data: T;
}

const ERRORS: Record<number, string> = {
  1601000: "API key da CJ inválida (usuário não encontrado). Confira CJ_API_KEY.",
  1600005: "API key da CJ incorreta. Confira CJ_API_KEY (My CJ > API).",
  1600001: "Token da CJ inválido ou expirado.",
  1600014: "Acesso à API desativado nesta conta da CJ.",
  1600200: "Limite de requisições da CJ atingido; tente em instantes.",
  16900500: "Pontos de API da CJ insuficientes.",
};

let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  await throttle();
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.token ? { "CJ-Access-Token": init.token } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!body) throw new SupplierError(`CJ: resposta inválida (HTTP ${res.status})`, PROVIDER, res.status);
  // a CJ responde em dois formatos: {code: 200, result: true} e {success: true, code: 0}
  const ok = body.code === 200 || (body as { success?: boolean }).success === true;
  if (!ok || body.result === false) {
    throw new SupplierError(`CJ: ${ERRORS[body.code] ?? body.message ?? `erro ${body.code}`}`, PROVIDER, body.code);
  }
  return body.data;
}

// ---------- Token ----------

let memo: { token: string; expiresAt: number } | null = null;

async function getToken(force = false): Promise<string> {
  if (!force && memo && memo.expiresAt - Date.now() > 86_400_000) return memo.token;
  const db = getDb();
  if (!force) {
    const [row] = await db.select().from(integrationTokens).where(eq(integrationTokens.provider, PROVIDER));
    if (row?.expiresAt && row.expiresAt.getTime() - Date.now() > 86_400_000) {
      memo = { token: row.accessToken, expiresAt: row.expiresAt.getTime() };
      return row.accessToken;
    }
  }
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) throw new SupplierError("CJ não configurada: defina CJ_API_KEY.", PROVIDER);
  const t = await call<{ accessToken: string; accessTokenExpiryDate: string; refreshToken: string; openId?: number }>(
    "/authentication/getAccessToken",
    { method: "POST", body: JSON.stringify({ apiKey }) },
  );
  const expiresAt = new Date(t.accessTokenExpiryDate);
  const row = { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt, meta: { openId: t.openId }, updatedAt: new Date() };
  await db
    .insert(integrationTokens)
    .values({ provider: PROVIDER, ...row })
    .onConflictDoUpdate({ target: integrationTokens.provider, set: row });
  memo = { token: t.accessToken, expiresAt: expiresAt.getTime() };
  return t.accessToken;
}

/** GET autenticado, renovando o token uma vez se a CJ disser que expirou. */
async function authed<T>(path: string): Promise<T> {
  try {
    return await call<T>(path, { token: await getToken() });
  } catch (err) {
    if (err instanceof SupplierError && err.code === 1600001) return call<T>(path, { token: await getToken(true) });
    throw err;
  }
}

// ---------- Armazéns ----------

let warehouses: Set<string> | null = null;

/** Países com armazém da CJ (a documentação só garante CN e US; o Brasil é checado em tempo real). */
export async function cjWarehouseCountries(): Promise<Set<string>> {
  if (warehouses) return warehouses;
  const list = await authed<{ countryCode: string; disabled?: boolean }[]>("/product/globalWarehouseList");
  warehouses = new Set(list.filter((w) => !w.disabled).map((w) => w.countryCode.toUpperCase()));
  return warehouses;
}

// ---------- Busca ----------

interface ListV2Product {
  id: string;
  nameEn?: string;
  sku?: string;
  bigImage?: string;
  sellPrice?: string | number;
  nowPrice?: string | number;
  warehouseInventoryNum?: number;
  directMinOrderNum?: number;
  deliveryCycle?: string;
}

function priceNumbers(v: unknown): number[] {
  if (typeof v === "number") return [v];
  return String(v ?? "")
    .split(/[^0-9.]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** "11.85" | "2.10 -- 4.50" | 3.2 -> menor preço numérico */
export function parseCjPrice(v: unknown): number {
  const nums = priceNumbers(v);
  return nums.length ? Math.min(...nums) : NaN;
}

/** maior preço de uma faixa ("2.10 -- 4.50" -> 4.5); null quando é preço único */
export function parseCjPriceMax(v: unknown): number | null {
  const nums = priceNumbers(v);
  return nums.length > 1 ? Math.max(...nums) : null;
}

export function mapCjProduct(p: ListV2Product, shipFrom: string | null): SupplierOffer {
  const price = parseCjPrice(p.nowPrice) || parseCjPrice(p.sellPrice);
  const max = parseCjPriceMax(p.nowPrice) ?? parseCjPriceMax(p.sellPrice);
  return {
    source: PROVIDER,
    sourceName: "CJ Dropshipping",
    externalId: p.id,
    title: p.nameEn ?? p.sku ?? p.id,
    imageUrl: p.bigImage ?? null,
    url: `https://cjdropshipping.com/product/-p-${p.id}.html`,
    unitPrice: price,
    currency: "USD",
    shipFrom,
    shippingPerUnit: null,
    shippingDays: p.deliveryCycle ?? null,
    stock: p.warehouseInventoryNum ?? null,
    moq: p.directMinOrderNum ?? null,
    priceMax: max,
  };
}

async function listV2(query: string, size: number, countryCode?: string): Promise<ListV2Product[]> {
  const qs = new URLSearchParams({ keyWord: query, page: "1", size: String(size), orderBy: "0" });
  if (countryCode) qs.set("countryCode", countryCode);
  const data = await authed<{ content?: { productList?: ListV2Product[] }[] }>(`/product/listV2?${qs}`);
  return (data.content ?? []).flatMap((c) => c.productList ?? []);
}

export const cjAdapter: SupplierAdapter = {
  id: PROVIDER,
  name: "CJ Dropshipping",
  configured: () => Boolean(process.env.CJ_API_KEY),
  /**
   * Busca em duas etapas: primeiro só itens com estoque no Brasil (se houver armazém BR),
   * depois o catálogo geral, marcado como enviado da China.
   */
  async search(query: string, opts: SearchOptions = {}) {
    const limit = Math.min(opts.limit ?? 20, 50);
    const countries = await cjWarehouseCountries().catch(() => new Set<string>());
    const offers = new Map<string, SupplierOffer>();
    if (countries.has("BR")) {
      for (const p of await listV2(query, limit, "BR")) offers.set(p.id, mapCjProduct(p, "BR"));
    }
    if (opts.shipFrom !== "BR") {
      for (const p of await listV2(query, limit)) if (!offers.has(p.id)) offers.set(p.id, mapCjProduct(p, "CN"));
    }
    return [...offers.values()].filter((o) => Number.isFinite(o.unitPrice) && o.unitPrice > 0);
  },
};
