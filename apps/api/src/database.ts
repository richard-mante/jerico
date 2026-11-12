import type { QueuePublisher } from "@jerico/queue";
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
  UPTIME_RESULTS_SECRET?: string;
  UPTIME_PROBES?: QueuePublisher<unknown>;
  NOTIFICATIONS?: QueuePublisher<unknown>;
  NOTIFICATION_DELIVERY_SECRET?: string;
  WEBHOOK_ENCRYPTION_KEY?: string;
};
export type JericoDatabase = NodePgDatabase<typeof schema>;

export async function withDatabase<T>(
  env: ApiBindings,
  callback: (database: JericoDatabase) => Promise<T>,
): Promise<T> {
  const hyperdrive = env.HYPERDRIVE;
  const connectionString = hyperdrive?.connectionString ?? env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Database is not configured. Set HYPERDRIVE or DATABASE_URL.");
  }

  // Hyperdrive pools origin connections independently. Create a request-scoped
  // client; Workers clean up this edge connection when the invocation ends.
  const client = new Client({ connectionString });
  await client.connect();

  try {
    return await callback(drizzle(client, { schema }));
  } finally {
    // Local Node.js development owns its direct connection and must close it.
    // Do not call end() for Hyperdrive clients in a Worker invocation.
    if (!hyperdrive) await client.end();
  }
}
