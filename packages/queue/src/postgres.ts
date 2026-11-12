import type {
  QueueBatch,
  QueueDelivery,
  QueueHealth,
  QueuePublisher,
  QueueSendOptions,
} from "./index";

type QueryResult<Row> = { rows: Row[]; rowCount: number | null };
type PostgresClientLike = {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
  release?(): void;
};
export type PostgresPoolLike = {
  connect(): Promise<PostgresClientLike>;
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
};

type StoredQueueMessage<TMessage> = {
  id: string;
  payload: TMessage;
  attempts: number;
  max_attempts: number;
};

export type PostgresQueueOptions = {
  maxAttempts?: number;
  maxPayloadBytes?: number;
};

export class StaleQueueLeaseError extends Error {
  constructor() {
    super("The queue message lease is no longer active.");
    this.name = "StaleQueueLeaseError";
  }
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(label + " is outside the supported range.");
  }
  return value;
}

function defaultRetryDelaySeconds(attempt: number): number {
  return Math.min(5 * 2 ** Math.max(0, attempt - 1), 3_600);
}

function safeErrorCode(value: string): string {
  return /^[a-z0-9_.-]{1,80}$/i.test(value) ? value : "handler_error";
}

/**
 * PostgreSQL-backed durable queue. It uses short transactions for claims and
 * never holds a database connection/transaction while a job handler executes.
 */
export class PostgresQueueAdapter<TMessage>
  implements QueuePublisher<TMessage> {
  readonly queueName: string;
  private readonly pool: PostgresPoolLike;
  private readonly maxAttempts: number;
  private readonly maxPayloadBytes: number;

  constructor(
    pool: PostgresPoolLike,
    queueName: string,
    options: PostgresQueueOptions = {},
  ) {
    if (!/^[a-z][a-z0-9_-]{0,62}$/i.test(queueName)) {
      throw new TypeError("Queue name must be 1–63 letters, numbers, underscores, or hyphens.");
    }
    this.pool = pool;
    this.queueName = queueName;
    this.maxAttempts = boundedInteger(options.maxAttempts ?? 5, 1, 100, "maxAttempts");
    this.maxPayloadBytes = boundedInteger(options.maxPayloadBytes ?? 256 * 1024, 1024, 256 * 1024, "maxPayloadBytes");
  }

  async send(message: TMessage, options: QueueSendOptions = {}): Promise<void> {
    const serialized = JSON.stringify(message);
    if (!serialized) throw new TypeError("Queue message must be JSON serializable.");
    const payloadBytes = new TextEncoder().encode(serialized).byteLength;
    if (payloadBytes > this.maxPayloadBytes || payloadBytes > 256 * 1024) {
      throw new RangeError("Queue message exceeds the 256 KiB payload limit.");
    }
    const delaySeconds = boundedInteger(options.delaySeconds ?? 0, 0, 86_400, "delaySeconds");
    const deduplicationKey = options.deduplicationKey ?? null;
    if (deduplicationKey !== null && (deduplicationKey.length < 1 || deduplicationKey.length > 200)) {
      throw new RangeError("Queue deduplication key must be between 1 and 200 characters.");
    }

    const id = crypto.randomUUID();
    const availableAt = new Date(Date.now() + delaySeconds * 1000);
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO queue_messages
        (id, queue_name, payload, deduplication_key, status, available_at, max_attempts)
       VALUES ($1, $2, $3::jsonb, $4, 'available', $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [id, this.queueName, serialized, deduplicationKey, availableAt, this.maxAttempts],
    );
    if (inserted.rows.length) return;
    if (deduplicationKey !== null) {
      const existing = await this.pool.query<{ id: string }>(
        `SELECT id FROM queue_messages
         WHERE queue_name = $1 AND deduplication_key = $2
           AND status IN ('available', 'leased')
         LIMIT 1`,
        [this.queueName, deduplicationKey],
      );
      if (existing.rows.length) return;
    }
    throw new Error("Queue message could not be persisted.");
  }

  async claim(
    limit = 10,
    visibilityTimeoutSeconds = 60,
    now = new Date(),
  ): Promise<QueueBatch<TMessage>> {
    boundedInteger(limit, 1, 100, "claim limit");
    boundedInteger(visibilityTimeoutSeconds, 1, 3_600, "visibility timeout");
    const client = await this.pool.connect();
    const claimed: Array<{
      row: StoredQueueMessage<TMessage>;
      leaseToken: string;
      leaseExpiresAt: Date;
    }> = [];
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE queue_messages
         SET status = 'dead_lettered', lease_token = NULL, lease_expires_at = NULL,
             last_error_code = COALESCE(last_error_code, 'lease_expired'), completed_at = $2, updated_at = $2
         WHERE queue_name = $1 AND status = 'leased'
           AND lease_expires_at <= $2 AND attempts >= max_attempts`,
        [this.queueName, now],
      );
      const candidates = await client.query<StoredQueueMessage<TMessage>>(
        `SELECT id, payload, attempts, max_attempts
         FROM queue_messages
         WHERE queue_name = $1
           AND (
             (status = 'available' AND available_at <= $2)
             OR (status = 'leased' AND lease_expires_at <= $2 AND attempts < max_attempts)
           )
         ORDER BY available_at ASC, created_at ASC
         LIMIT $3
         FOR UPDATE SKIP LOCKED`,
        [this.queueName, now, limit],
      );
      for (const row of candidates.rows) {
        const leaseToken = crypto.randomUUID();
        const leaseExpiresAt = new Date(now.getTime() + visibilityTimeoutSeconds * 1000);
        const result = await client.query<StoredQueueMessage<TMessage>>(
          `UPDATE queue_messages
           SET status = 'leased', lease_token = $2, lease_expires_at = $3,
               attempts = attempts + 1, updated_at = $4
           WHERE id = $1
           RETURNING id, payload, attempts, max_attempts`,
          [row.id, leaseToken, leaseExpiresAt, now],
        );
        if (result.rows[0]) claimed.push({ row: result.rows[0], leaseToken, leaseExpiresAt });
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release?.();
    }

    const messages: QueueDelivery<TMessage>[] = claimed.map(({ row, leaseToken }) => ({
      id: row.id,
      body: row.payload,
      attempts: row.attempts,
      ack: () => this.ack(row.id, leaseToken),
      retry: (options) => this.retry(row.id, leaseToken, row.attempts, row.max_attempts, options?.delaySeconds ?? defaultRetryDelaySeconds(row.attempts), options?.errorCode),
    }));
    return { queue: this.queueName, messages };
  }

  async ack(messageId: string, leaseToken: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE queue_messages
       SET status = 'completed', lease_token = NULL, lease_expires_at = NULL,
           completed_at = now(), updated_at = now()
       WHERE id = $1 AND queue_name = $2 AND status = 'leased' AND lease_token = $3 AND lease_expires_at > now()`,
      [messageId, this.queueName, leaseToken],
    );
    if (result.rowCount !== 1) throw new StaleQueueLeaseError();
  }

  async retry(
    messageId: string,
    leaseToken: string,
    attempts: number,
    maxAttempts: number,
    delaySeconds: number,
    errorCode = "handler_error",
  ): Promise<void> {
    boundedInteger(delaySeconds, 0, 86_400, "retry delay");
    const terminal = attempts >= maxAttempts;
    const result = await this.pool.query(
      `UPDATE queue_messages
       SET status = $4, available_at = CASE WHEN $4 = 'available'
             THEN now() + ($5 * interval '1 second') ELSE available_at END,
           lease_token = NULL, lease_expires_at = NULL,
           last_error_code = $6,
           completed_at = CASE WHEN $4 = 'dead_lettered' THEN now() ELSE NULL END,
           updated_at = now()
       WHERE id = $1 AND queue_name = $2 AND status = 'leased' AND lease_token = $3 AND lease_expires_at > now()`,
      [messageId, this.queueName, leaseToken, terminal ? "dead_lettered" : "available", delaySeconds, safeErrorCode(errorCode)],
    );
    if (result.rowCount !== 1) throw new StaleQueueLeaseError();
  }

  async deadLetter(messageId: string, leaseToken: string, errorCode: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE queue_messages
       SET status = 'dead_lettered', lease_token = NULL, lease_expires_at = NULL,
           last_error_code = $4, completed_at = now(), updated_at = now()
       WHERE id = $1 AND queue_name = $2 AND status = 'leased' AND lease_token = $3 AND lease_expires_at > now()`,
      [messageId, this.queueName, leaseToken, safeErrorCode(errorCode)],
    );
    if (result.rowCount !== 1) throw new StaleQueueLeaseError();
  }

  async extendLease(messageId: string, leaseToken: string, visibilityTimeoutSeconds: number): Promise<void> {
    boundedInteger(visibilityTimeoutSeconds, 1, 3_600, "visibility timeout");
    const result = await this.pool.query(
      `UPDATE queue_messages
       SET lease_expires_at = now() + ($4 * interval '1 second'), updated_at = now()
       WHERE id = $1 AND queue_name = $2 AND status = 'leased' AND lease_token = $3 AND lease_expires_at > now()`,
      [messageId, this.queueName, leaseToken, visibilityTimeoutSeconds],
    );
    if (result.rowCount !== 1) throw new StaleQueueLeaseError();
  }

  async health(): Promise<QueueHealth> {
    const result = await this.pool.query<{
      queue_depth: string;
      oldest_age_seconds: string | null;
      dead_letter_count: string;
    }>(
      `SELECT
         count(*) FILTER (WHERE status IN ('available', 'leased'))::text AS queue_depth,
         EXTRACT(EPOCH FROM (now() - min(available_at) FILTER (WHERE status = 'available')))::text AS oldest_age_seconds,
         count(*) FILTER (WHERE status = 'dead_lettered')::text AS dead_letter_count
       FROM queue_messages WHERE queue_name = $1`,
      [this.queueName],
    );
    const row = result.rows[0];
    const queueDepth = Number(row?.queue_depth ?? 0);
    const deadLetterCount = Number(row?.dead_letter_count ?? 0);
    return {
      status: deadLetterCount > 0 ? "degraded" : "healthy",
      queueDepth,
      oldestMessageAgeSeconds: row?.oldest_age_seconds === null ? undefined : Number(row?.oldest_age_seconds ?? 0),
      deadLetterCount,
    };
  }

  async listDeadLetters(limit = 50): Promise<Array<{
    id: string;
    attempts: number;
    maxAttempts: number;
    lastErrorCode: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }>> {
    boundedInteger(limit, 1, 100, "dead-letter limit");
    const result = await this.pool.query<{
      id: string;
      attempts: number;
      max_attempts: number;
      last_error_code: string | null;
      created_at: Date;
      completed_at: Date | null;
    }>(
      `SELECT id, attempts, max_attempts, last_error_code, created_at, completed_at
       FROM queue_messages
       WHERE queue_name = $1 AND status = 'dead_lettered'
       ORDER BY completed_at DESC NULLS LAST, created_at DESC
       LIMIT $2`,
      [this.queueName, limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      lastErrorCode: row.last_error_code,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    }));
  }

  async getDeadLetter(messageId: string): Promise<{
    id: string;
    payload: TMessage;
    attempts: number;
    maxAttempts: number;
    lastErrorCode: string | null;
    createdAt: Date;
    completedAt: Date | null;
  } | null> {
    const result = await this.pool.query<{
      id: string;
      payload: TMessage;
      attempts: number;
      max_attempts: number;
      last_error_code: string | null;
      created_at: Date;
      completed_at: Date | null;
    }>(
      `SELECT id, payload, attempts, max_attempts, last_error_code, created_at, completed_at
       FROM queue_messages
       WHERE id = $1 AND queue_name = $2 AND status = 'dead_lettered'
       LIMIT 1`,
      [messageId, this.queueName],
    );
    const row = result.rows[0];
    return row ? {
      id: row.id,
      payload: row.payload,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      lastErrorCode: row.last_error_code,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    } : null;
  }

  async replayDeadLetter(messageId: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `UPDATE queue_messages
         SET status = 'available', attempts = 0, available_at = now(),
             lease_token = NULL, lease_expires_at = NULL, last_error_code = NULL,
             completed_at = NULL, updated_at = now()
         WHERE id = $1 AND queue_name = $2 AND status = 'dead_lettered'`,
        [messageId, this.queueName],
      );
      return result.rowCount === 1;
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        return false;
      }
      throw error;
    }
  }

  async prune(retentionDays = 7, now = new Date()): Promise<number> {
    boundedInteger(retentionDays, 1, 365, "retentionDays");
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.pool.query(
      `DELETE FROM queue_messages
       WHERE queue_name = $1 AND status IN ('completed', 'dead_lettered')
         AND completed_at < $2`,
      [this.queueName, cutoff],
    );
    return result.rowCount ?? 0;
  }
}
