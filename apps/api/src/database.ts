import { Client } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { schema } from "@jerico/database/schema";

export type ApiBindings = {
  APP_ENV?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_SECRET?: string;
  WEB_APP_URL?: string;
  DATABASE_URL?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  HYPERDRIVE?: { connectionString: string };
};
export type JericoDatabase = NodePgDatabase<typeof schema>;

export async function withDatabase<T>(
  env: ApiBindings,
  callback: (database: JericoDatabase) => Promise<T>,
): Promise<T> {
  const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
  if (!connectionString) throw new Error("Database is not configured. Set HYPERDRIVE or DATABASE_URL.");

  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await callback(drizzle(client, { schema }));
  } finally {
    await client.end();
  }
}
