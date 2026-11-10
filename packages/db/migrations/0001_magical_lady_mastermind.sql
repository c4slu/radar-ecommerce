CREATE TABLE "ml_bestseller_ranks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" text NOT NULL,
	"category_id" text NOT NULL,
	"day" date NOT NULL,
	"position" smallint NOT NULL,
	"type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ml_catalog_products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain_id" text,
	"category_id" text,
	"picture_url" text,
	"permalink" text,
	"catalog_created_at" timestamp with time zone,
	"first_seen" date DEFAULT now() NOT NULL,
	"last_seen" date DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ml_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"level" smallint NOT NULL,
	"path" text NOT NULL,
	"total_items" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_scanned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ml_fee_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" text NOT NULL,
	"price_bucket" integer NOT NULL,
	"listing_type_id" text NOT NULL,
	"listing_type_name" text,
	"percentage_fee" numeric(6, 3) NOT NULL,
	"fixed_fee" numeric(12, 2) DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ml_offer_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" text NOT NULL,
	"day" date NOT NULL,
	"listings_count" integer NOT NULL,
	"sellers_count" integer NOT NULL,
	"price_min" numeric(12, 2),
	"price_median" numeric(12, 2),
	"price_max" numeric(12, 2),
	"full_count" integer DEFAULT 0 NOT NULL,
	"official_count" integer DEFAULT 0 NOT NULL,
	"free_shipping_share" numeric(6, 4),
	"premium_share" numeric(6, 4),
	"offers" jsonb
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ml_bestseller_ranks_unique" ON "ml_bestseller_ranks" USING btree ("product_id","category_id","day");--> statement-breakpoint
CREATE INDEX "ml_bestseller_ranks_day_idx" ON "ml_bestseller_ranks" USING btree ("day","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ml_fee_cache_unique" ON "ml_fee_cache" USING btree ("category_id","price_bucket","listing_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ml_offer_snapshots_unique" ON "ml_offer_snapshots" USING btree ("product_id","day");