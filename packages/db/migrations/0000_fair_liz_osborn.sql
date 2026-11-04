CREATE TYPE "public"."job_status" AS ENUM('running', 'success', 'error');--> statement-breakpoint
CREATE TYPE "public"."marketplace" AS ENUM('mercadolivre', 'shopee', 'tiktokshop');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('entrada', 'saida', 'ajuste');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('pesquisa', 'aprovado', 'ativo', 'descontinuado');--> statement-breakpoint
CREATE TYPE "public"."supplier_channel" AS ENUM('nacional', 'importacao');--> statement-breakpoint
CREATE TYPE "public"."trend_source" AS ENUM('google', 'ml_trends', 'tiktok');--> statement-breakpoint
CREATE TABLE "alert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid,
	"product_id" uuid,
	"message" text NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"product_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pair" text NOT NULL,
	"rate" numeric(12, 6) NOT NULL,
	"day" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_tokens" (
	"provider" text PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"meta" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_id" uuid,
	"quantity" integer NOT NULL,
	"landed_unit_cost" numeric(12, 4) NOT NULL,
	"received_at" date DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"status" "job_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"items_processed" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "market_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"marketplace" "marketplace" NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"sold_quantity" integer,
	"reviews_count" integer,
	"seller_id" text,
	"seller_name" text,
	"is_official_store" boolean DEFAULT false NOT NULL,
	"is_fulfillment" boolean DEFAULT false NOT NULL,
	"url" text,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"marketplace" "marketplace" NOT NULL,
	"day" date NOT NULL,
	"price_min" numeric(12, 2),
	"price_median" numeric(12, 2),
	"price_max" numeric(12, 2),
	"price_stddev" numeric(12, 2),
	"listings_count" integer DEFAULT 0 NOT NULL,
	"sellers_count" integer DEFAULT 0 NOT NULL,
	"official_share" numeric(6, 4),
	"sold_total" integer
);
--> statement-breakpoint
CREATE TABLE "marketplace_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace" "marketplace" NOT NULL,
	"category_id" text,
	"label" text,
	"commission_pct" numeric(6, 4) NOT NULL,
	"fixed_fee" numeric(12, 2) DEFAULT 0 NOT NULL,
	"min_price" numeric(12, 2),
	"max_price" numeric(12, 2),
	"valid_from" date DEFAULT now() NOT NULL,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"ml_category_id" text,
	"weight_grams" integer,
	"length_cm" numeric,
	"width_cm" numeric,
	"height_cm" numeric,
	"search_terms" text[] DEFAULT '{}' NOT NULL,
	"status" "product_status" DEFAULT 'pesquisa' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "risk_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"marketplace" "marketplace" NOT NULL,
	"day" date NOT NULL,
	"score" smallint NOT NULL,
	"level" text NOT NULL,
	"suggested_price" numeric(12, 2),
	"break_even_price" numeric(12, 2),
	"recommended_lot_qty" integer,
	"details" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"lot_id" uuid,
	"type" "movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"marketplace" "marketplace",
	"unit_price" numeric(12, 2),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "supplier_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"unit_price" numeric(12, 4) NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"min_qty" integer,
	"freight_total" numeric(12, 2),
	"other_costs_total" numeric(12, 2),
	"valid_until" date,
	"quoted_at" date DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"cnpj" text,
	"contact_name" text,
	"phone" text,
	"email" text,
	"website" text,
	"city" text,
	"state" text,
	"channel" "supplier_channel" DEFAULT 'nacional' NOT NULL,
	"lead_time_days" integer,
	"min_order_value" numeric(12, 2),
	"rating" smallint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trend_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"term" text NOT NULL,
	"source" "trend_source" NOT NULL,
	"value" numeric NOT NULL,
	"day" date NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_scores" ADD CONSTRAINT "risk_scores_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD CONSTRAINT "supplier_quotes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD CONSTRAINT "supplier_quotes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_signals" ADD CONSTRAINT "trend_signals_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rates_unique" ON "fx_rates" USING btree ("pair","day");--> statement-breakpoint
CREATE INDEX "job_runs_job_idx" ON "job_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE INDEX "market_listings_lookup_idx" ON "market_listings" USING btree ("product_id","marketplace","collected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "market_snapshots_unique" ON "market_snapshots" USING btree ("product_id","marketplace","day");--> statement-breakpoint
CREATE UNIQUE INDEX "risk_scores_unique" ON "risk_scores" USING btree ("product_id","marketplace","day");--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("product_id","occurred_at");--> statement-breakpoint
CREATE INDEX "supplier_quotes_product_idx" ON "supplier_quotes" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trend_signals_unique" ON "trend_signals" USING btree ("term","source","day");