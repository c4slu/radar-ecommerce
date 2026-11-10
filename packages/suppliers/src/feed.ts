import { parseLocaleNumber } from "@radar/core";

/**
 * Leitor de catálogos de fornecedores (o "XML/CSV para loja virtual" que atacadistas e
 * plataformas de dropshipping nacionais fornecem). Formatos aceitos:
 *  - XML Google Merchant (RSS <item> / Atom <entry> com tags g:*)
 *  - XML de produtos com tags em português ou inglês (<produto><nome><preco>… / <product><name><price>…)
 *  - CSV separado por vírgula, ponto e vírgula ou tab, com cabeçalho
 * Sem dependências: o suficiente para catálogos de produtos (não é um parser XML completo).
 */

export interface FeedItem {
  externalId: string;
  title: string;
  price: number;
  /** preço promocional, quando o catálogo traz os dois */
  salePrice: number | null;
  stock: number | null;
  available: boolean;
  imageUrl: string | null;
  url: string | null;
  brand: string | null;
  model: string | null;
  gtin: string | null;
}

export type FeedFormat = "xml" | "csv";

/** Sinônimos de cada campo (minúsculo, sem acento, sem prefixo g:). O primeiro que existir vence. */
const FIELDS: Record<keyof Omit<FeedItem, "available" | "price" | "salePrice"> | "price" | "salePrice" | "availability", string[]> = {
  externalId: ["id", "sku", "codigo", "cod", "referencia", "ref", "item_group_id", "product_id"],
  title: ["title", "titulo", "nome", "name", "descricao_curta", "produto"],
  price: ["price", "preco", "valor", "preco_venda", "preco_atacado", "valor_venda", "preco_custo", "custo"],
  salePrice: ["sale_price", "preco_promocional", "promocao", "preco_promocao"],
  stock: ["quantity", "quantidade", "estoque", "stock", "saldo", "qtd", "inventory"],
  availability: ["availability", "disponibilidade", "disponivel", "status"],
  imageUrl: ["image_link", "imagem", "image", "foto", "url_imagem", "imagem_principal", "imagens", "images", "fotos"],
  url: ["link", "url", "url_produto", "product_url"],
  brand: ["brand", "marca", "fabricante"],
  model: ["mpn", "modelo", "model", "part_number"],
  gtin: ["gtin", "ean", "codigo_barras", "barcode", "upc"],
};

const norm = (k: string) =>
  k
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^g:/, "")
    .replace(/[\s-]+/g, "_");

const decode = (s: string) =>
  s
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();

/** "79,90 BRL" | "R$ 79,90" | "79.90" -> 79.9 */
export function parseFeedPrice(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseLocaleNumber(v.replace(/[A-Za-z]{3}$/, "").replace(/[^\d.,-]/g, ""));
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

function pick(rec: Record<string, string>, field: keyof typeof FIELDS): string | undefined {
  for (const k of FIELDS[field]) if (rec[k]) return rec[k];
  return undefined;
}

function toItem(rec: Record<string, string>): FeedItem | null {
  const title = pick(rec, "title");
  const price = parseFeedPrice(pick(rec, "price"));
  if (!title || price == null) return null;
  const sale = parseFeedPrice(pick(rec, "salePrice"));
  const stockRaw = pick(rec, "stock");
  const stock = stockRaw != null && /\d/.test(stockRaw) ? Math.max(0, Math.floor(parseLocaleNumber(stockRaw) ?? 0)) : null;
  const avail = (pick(rec, "availability") ?? "").toLowerCase();
  const unavailable = /out.?of.?stock|indisponivel|esgotado|sem estoque|inativo|^0$|^nao$|^false$/.test(norm(avail).replace(/_/g, " "));
  const gtin = pick(rec, "gtin")?.replace(/\D/g, "") || null;
  return {
    externalId: pick(rec, "externalId") ?? gtin ?? title.slice(0, 80),
    title,
    price,
    salePrice: sale != null && sale < price ? sale : null,
    stock,
    available: !unavailable && (stock == null || stock > 0),
    imageUrl: pick(rec, "imageUrl") ?? null,
    url: pick(rec, "url") ?? null,
    brand: pick(rec, "brand") ?? null,
    model: pick(rec, "model") ?? null,
    gtin: gtin && gtin.length >= 8 ? gtin : null,
  };
}

// ---------- XML ----------

const RECORD_TAGS = ["item", "entry", "produto", "product", "offer", "oferta"];

function parseXml(xml: string): FeedItem[] {
  // escolhe a tag de registro que mais se repete no documento
  const counts = RECORD_TAGS.map((t) => ({ t, n: (xml.match(new RegExp(`<(?:[\\w-]+:)?${t}[\\s>]`, "gi")) ?? []).length }));
  const best = counts.sort((a, b) => b.n - a.n)[0];
  if (!best || best.n === 0) return [];
  const recRe = new RegExp(`<((?:[\\w-]+:)?${best.t})(?:\\s[^>]*)?>([\\s\\S]*?)</\\1>`, "gi");
  const childRe = /<([\w:-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  const out: FeedItem[] = [];
  for (const m of xml.matchAll(recRe)) {
    const rec: Record<string, string> = {};
    for (const c of m[2]!.matchAll(childRe)) {
      const key = norm(c[1]!);
      // tags aninhadas (ex.: <imagens><imagem>…) ficam com o primeiro texto simples
      // CDATA primeiro: senão a limpeza de tags apagaria o bloco <![CDATA[...]]> inteiro
      const raw = c[2]!.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
      const value = decode(raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
      if (value && !rec[key]) rec[key] = value;
    }
    const item = toItem(rec);
    if (item) out.push(item);
  }
  return out;
}

// ---------- CSV ----------

function splitCsvLine(line: string, sep: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function parseCsv(text: string): FeedItem[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const head = lines[0]!;
  const sep = [";", "\t", ","].map((s) => ({ s, n: head.split(s).length })).sort((a, b) => b.n - a.n)[0]!.s;
  const keys = splitCsvLine(head, sep).map(norm);
  const out: FeedItem[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, sep);
    const rec: Record<string, string> = {};
    keys.forEach((k, i) => {
      if (cells[i] && !rec[k]) rec[k] = cells[i]!;
    });
    const item = toItem(rec);
    if (item) out.push(item);
  }
  return out;
}

export function detectFormat(text: string): FeedFormat {
  return /^\s*(<\?xml|<rss|<feed|<\w)/.test(text.replace(/^\uFEFF/, "")) ? "xml" : "csv";
}

/** Lê um catálogo inteiro. Itens sem título ou preço são ignorados. */
export function parseFeed(text: string, format?: FeedFormat): FeedItem[] {
  return (format ?? detectFormat(text)) === "xml" ? parseXml(text) : parseCsv(text);
}
