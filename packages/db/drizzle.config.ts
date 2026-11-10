import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// .env.local (desenvolvimento) primeiro: dotenv não sobrescreve, então ele vence o .env
config({ path: "../../.env.local", quiet: true });
config({ path: "../../.env", quiet: true });

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
