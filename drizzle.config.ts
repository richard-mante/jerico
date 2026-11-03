import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/database/src/schema.ts",
  out: "./packages/database/drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://jerico:jerico@localhost:5432/jerico",
  },
  strict: true,
  verbose: true,
});
