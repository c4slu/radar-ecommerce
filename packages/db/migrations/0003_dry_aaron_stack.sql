CREATE TABLE "supplier_feed_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"sale_price" numeric(12, 2),
	"stock" integer,
	"available" boolean DEFAULT true NOT NULL,
	"image_url" text,
	"url" text,
	"brand" text,
	"model" text,
	"gtin" text,
	"search_text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"item_count" integer,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_feed_items" ADD CONSTRAINT "supplier_feed_items_feed_id_supplier_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."supplier_feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_feed_items_unique" ON "supplier_feed_items" USING btree ("feed_id","external_id");--> statement-breakpoint
CREATE INDEX "supplier_feed_items_feed_idx" ON "supplier_feed_items" USING btree ("feed_id");