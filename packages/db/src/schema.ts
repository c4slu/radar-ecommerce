import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: "number" });
const fraction = (name: string) => numeric(name, { precision: 6, scale: 4, mode: "number" });

export const marketplaceEnum = pgEnum("marketplace", ["mercadolivre", "shopee", "tiktokshop"]);
export const productStatusEnum = pgEnum("product_status", ["pesquisa", "aprovado", "ativo", "descontinuado"]);
export const supplierChannelEnum = pgEnum("supplier_channel", ["nacional", "importacao"]);
export const movementTypeEnum = pgEnum("movement_type", ["entrada", "saida", "ajuste"]);
export const trendSourceEnum = pgEnum("trend_source", ["google", "ml_trends", "tiktok"]);
export const jobStatusEnum = pgEnum("job_status", ["running", "success", "error"]);

// ---------- Cadastros ----------

export const suppliers = pgTable("suppliers", {
  id: id(),
  name: text("name").notNull(),
  cnpj: text("cnpj"),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  city: text("city"),
  state: text("state"),
  channel: supplierChannelEnum("channel").notNull().default("nacional"),
  leadTimeDays: integer("lead_time_days"),
  minOrderValue: money("min_order_value"),
  rating: smallint("rating"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const products = pgTable("products", {
  id: id(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  category: text("category"),
  /** id da categoria no Mercado Livre (ex.: MLB1234) para regras de tarifa */
  mlCategoryId: text("ml_category_id"),
  weightGrams: integer("weight_grams"),
  lengthCm: numeric("length_cm", { mode: "number" }),
  widthCm: numeric("width_cm", { mode: "number" }),
  heightCm: numeric("height_cm", { mode: "number" }),
  /** termos usados pelos coletores para buscar concorrentes */
  searchTerms: text("search_terms").array().notNull().default([]),
  status: productStatusEnum("status").notNull().default("pesquisa"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const supplierQuotes = pgTable(
  "supplier_quotes",
  {
    id: id(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
    unitPrice: numeric("unit_price", { precision: 12, scale: 4, mode: "number" }).notNull(),
    currency: text("currency").notNull().default("BRL"),
    minQty: integer("min_qty"),
    freightTotal: money("freight_total"),
    otherCostsTotal: money("other_costs_total"),
    validUntil: date("valid_until"),
    quotedAt: date("quoted_at").notNull().defaultNow(),
    notes: text("notes"),
    /** manual | cj | aliexpress | <fornecedor nacional> */
    source: text("source").notNull().default("manual"),
    externalId: text("external_id"),
    url: text("url"),
    imageUrl: text("image_url"),
    /** país de onde a oferta é enviada (ISO) */
    shipFrom: text("ship_from"),
    stock: integer("stock"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("supplier_quotes_product_idx").on(t.productId)],
);

// ---------- Estoque ----------

export const inventoryLots = pgTable("inventory_lots", {
  id: id(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  quantity: integer("quantity").notNull(),
  landedUnitCost: numeric("landed_unit_cost", { precision: 12, scale: 4, mode: "number" }).notNull(),
  receivedAt: date("received_at").notNull().defaultNow(),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
    lotId: uuid("lot_id").references(() => inventoryLots.id, { onDelete: "set null" }),
    type: movementTypeEnum("type").notNull(),
    /** positivo = entra, negativo = sai */
    quantity: integer("quantity").notNull(),
    marketplace: marketplaceEnum("marketplace"),
    unitPrice: money("unit_price"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
  },
  (t) => [index("stock_movements_product_idx").on(t.productId, t.occurredAt)],
);

// ---------- Mercado ----------

export const marketListings = pgTable(
  "market_listings",
  {
    id: id(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    marketplace: marketplaceEnum("marketplace").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    price: money("price").notNull(),
    soldQuantity: integer("sold_quantity"),
    reviewsCount: integer("reviews_count"),
    sellerId: text("seller_id"),
    sellerName: text("seller_name"),
    isOfficialStore: boolean("is_official_store").notNull().default(false),
    isFulfillment: boolean("is_fulfillment").notNull().default(false),
    url: text("url"),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("market_listings_lookup_idx").on(t.productId, t.marketplace, t.collectedAt)],
);

export const marketSnapshots = pgTable(
  "market_snapshots",
  {
    id: id(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    marketplace: marketplaceEnum("marketplace").notNull(),
    day: date("day").notNull(),
    priceMin: money("price_min"),
    priceMedian: money("price_median"),
    priceMax: money("price_max"),
    priceStddev: money("price_stddev"),
    listingsCount: integer("listings_count").notNull().default(0),
    sellersCount: integer("sellers_count").notNull().default(0),
    officialShare: fraction("official_share"),
    /** soma de sold_quantity dos anúncios no dia (usada para calcular deltas) */
    soldTotal: integer("sold_total"),
  },
  (t) => [uniqueIndex("market_snapshots_unique").on(t.productId, t.marketplace, t.day)],
);

export const trendSignals = pgTable(
  "trend_signals",
  {
    id: id(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    source: trendSourceEnum("source").notNull(),
    value: numeric("value", { mode: "number" }).notNull(),
    day: date("day").notNull(),
    meta: jsonb("meta"),
  },
  (t) => [uniqueIndex("trend_signals_unique").on(t.term, t.source, t.day)],
);

// ---------- Configuração / análise ----------

export const marketplaceFees = pgTable("marketplace_fees", {
  id: id(),
  marketplace: marketplaceEnum("marketplace").notNull(),
  categoryId: text("category_id"),
  label: text("label"),
  commissionPct: fraction("commission_pct").notNull(),
  fixedFee: money("fixed_fee").notNull().default(0),
  minPrice: money("min_price"),
  maxPrice: money("max_price"),
  validFrom: date("valid_from").notNull().defaultNow(),
  validTo: date("valid_to"),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const riskScores = pgTable(
  "risk_scores",
  {
    id: id(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    marketplace: marketplaceEnum("marketplace").notNull(),
    day: date("day").notNull(),
    score: smallint("score").notNull(),
    level: text("level").notNull(),
    suggestedPrice: money("suggested_price"),
    breakEvenPrice: money("break_even_price"),
    recommendedLotQty: integer("recommended_lot_qty"),
    details: jsonb("details").notNull(),
  },
  (t) => [uniqueIndex("risk_scores_unique").on(t.productId, t.marketplace, t.day)],
);

export const alertRules = pgTable("alert_rules", {
  id: id(),
  name: text("name").notNull(),
  /** ex.: { "type": "median_drop", "pct": 0.1, "days": 7 } */
  config: jsonb("config").notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
});

export const alertEvents = pgTable("alert_events", {
  id: id(),
  ruleId: uuid("rule_id").references(() => alertRules.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const fxRates = pgTable(
  "fx_rates",
  {
    id: id(),
    /** ex.: USD-BRL */
    pair: text("pair").notNull(),
    rate: numeric("rate", { precision: 12, scale: 6, mode: "number" }).notNull(),
    day: date("day").notNull(),
  },
  (t) => [uniqueIndex("fx_rates_unique").on(t.pair, t.day)],
);

/** Tokens OAuth (ML, Shopee). Acessível só pelo servidor/jobs: RLS bloqueia o resto. */
export const integrationTokens = pgTable("integration_tokens", {
  provider: text("provider").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  meta: jsonb("meta"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobRuns = pgTable(
  "job_runs",
  {
    id: id(),
    job: text("job").notNull(),
    status: jobStatusEnum("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    itemsProcessed: integer("items_processed"),
    error: text("error"),
  },
  (t) => [index("job_runs_job_idx").on(t.job, t.startedAt)],
);

// ---------- Oportunidades (catálogo do Mercado Livre) ----------

/** Árvore de categorias do ML varrida pelo coletor (1º e 2º nível). */
export const mlCategories = pgTable("ml_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  level: smallint("level").notNull(),
  path: text("path").notNull(),
  totalItems: integer("total_items"),
  enabled: boolean("enabled").notNull().default(true),
  lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
});

/** Produtos de catálogo que já apareceram nos rankings. */
export const mlCatalogProducts = pgTable("ml_catalog_products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  domainId: text("domain_id"),
  categoryId: text("category_id"),
  pictureUrl: text("picture_url"),
  permalink: text("permalink"),
  catalogCreatedAt: timestamp("catalog_created_at", { withTimezone: true }),
  firstSeen: date("first_seen").notNull().defaultNow(),
  lastSeen: date("last_seen").notNull().defaultNow(),
});

/** Posição diária no ranking de mais vendidos de cada categoria. */
export const mlBestsellerRanks = pgTable(
  "ml_bestseller_ranks",
  {
    id: id(),
    productId: text("product_id").notNull(),
    categoryId: text("category_id").notNull(),
    day: date("day").notNull(),
    position: smallint("position").notNull(),
    /** PRODUCT (catálogo, com detalhe) | ITEM | USER_PRODUCT (sem detalhe: o ML bloqueia) */
    type: text("type").notNull(),
  },
  (t) => [
    uniqueIndex("ml_bestseller_ranks_unique").on(t.productId, t.categoryId, t.day),
    index("ml_bestseller_ranks_day_idx").on(t.day, t.categoryId),
  ],
);

/** Retrato diário da concorrência de um produto de catálogo. */
export const mlOfferSnapshots = pgTable(
  "ml_offer_snapshots",
  {
    id: id(),
    productId: text("product_id").notNull(),
    day: date("day").notNull(),
    /** total de anúncios do produto no catálogo (paging.total) */
    listingsCount: integer("listings_count").notNull(),
    /** vendedores distintos entre os anúncios lidos (até 50) */
    sellersCount: integer("sellers_count").notNull(),
    priceMin: money("price_min"),
    priceMedian: money("price_median"),
    priceMax: money("price_max"),
    fullCount: integer("full_count").notNull().default(0),
    officialCount: integer("official_count").notNull().default(0),
    freeShippingShare: fraction("free_shipping_share"),
    premiumShare: fraction("premium_share"),
    /** vendedores lidos nesta coleta (até 50) com preço, tipo e logística */
    offers: jsonb("offers"),
  },
  (t) => [uniqueIndex("ml_offer_snapshots_unique").on(t.productId, t.day)],
);

/** Cache das tarifas oficiais (listing_prices) por categoria, faixa de preço e tipo de anúncio. */
export const mlFeeCache = pgTable(
  "ml_fee_cache",
  {
    id: id(),
    categoryId: text("category_id").notNull(),
    /** preço arredondado para baixo de 10 em 10 (a tarifa muda por faixa) */
    priceBucket: integer("price_bucket").notNull(),
    listingTypeId: text("listing_type_id").notNull(),
    listingTypeName: text("listing_type_name"),
    percentageFee: numeric("percentage_fee", { precision: 6, scale: 3, mode: "number" }).notNull(),
    fixedFee: money("fixed_fee").notNull().default(0),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ml_fee_cache_unique").on(t.categoryId, t.priceBucket, t.listingTypeId)],
);

/** Produto do catálogo do ML ligado à melhor oferta de fornecedor (estimada ou confirmada pelo usuário). */
export const mlSupplierMatches = pgTable(
  "ml_supplier_matches",
  {
    id: id(),
    catalogProductId: text("catalog_product_id").notNull(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    imageUrl: text("image_url"),
    url: text("url"),
    unitPrice: numeric("unit_price", { precision: 12, scale: 4, mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    shipFrom: text("ship_from"),
    /** custo final por unidade em R$ no momento da busca (null = importado no modo só nacional) */
    landedCost: money("landed_cost"),
    matchScore: smallint("match_score").notNull(),
    /** termo usado na busca (útil quando o usuário pesquisou em inglês) */
    query: text("query"),
    /** true = o usuário confirmou que é o mesmo produto */
    confirmed: boolean("confirmed").notNull().default(false),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ml_supplier_matches_unique").on(t.catalogProductId, t.source, t.externalId)],
);

// ---------- Catálogos de fornecedores nacionais (XML/CSV) ----------

export const supplierFeeds = pgTable("supplier_feeds", {
  id: id(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  itemCount: integer("item_count"),
  lastError: text("last_error"),
  createdAt: createdAt(),
});

export const supplierFeedItems = pgTable(
  "supplier_feed_items",
  {
    id: id(),
    feedId: uuid("feed_id")
      .notNull()
      .references(() => supplierFeeds.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    price: money("price").notNull(),
    salePrice: money("sale_price"),
    stock: integer("stock"),
    available: boolean("available").notNull().default(true),
    imageUrl: text("image_url"),
    url: text("url"),
    brand: text("brand"),
    model: text("model"),
    gtin: text("gtin"),
    /** título + marca + modelo normalizados (minúsculas, sem acento) para a busca */
    searchText: text("search_text").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("supplier_feed_items_unique").on(t.feedId, t.externalId), index("supplier_feed_items_feed_idx").on(t.feedId)],
);
