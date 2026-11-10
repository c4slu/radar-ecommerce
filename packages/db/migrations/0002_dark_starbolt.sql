CREATE TABLE "ml_supplier_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_product_id" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"image_url" text,
	"url" text,
	"unit_price" numeric(12, 4) NOT NULL,
	"currency" text NOT NULL,
	"ship_from" text,
	"landed_cost" numeric(12, 2),
	"match_score" smallint NOT NULL,
	"query" text,
	"confirmed" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD COLUMN "ship_from" text;--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD COLUMN "stock" integer;--> statement-breakpoint
ALTER TABLE "supplier_quotes" ADD COLUMN "fetched_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "ml_supplier_matches_unique" ON "ml_supplier_matches" USING btree ("catalog_product_id","source","external_id");