/**
 * Provider-neutral queue contracts.
 *
 * Domain services publish messages through QueuePublisher. Runtime adapters
 * translate native provider deliveries into QueueDelivery and QueueBatch.
 * Provider-specific SDK types must not cross this package boundary.
 */

export type QueueSendOptions = {
  /** Delay before the message becomes available, in seconds. */
  delaySeconds?: number;
  /** Stable provider-supported deduplication key, when available. */
  deduplicationKey?: string;
};

export interface QueuePublisher<TMessage> {
  send(message: TMessage, options?: QueueSendOptions): Promise<void>;
  sendBatch?(messages: readonly TMessage[]): Promise<void>;
}

export type QueueRetryOptions = {
  delaySeconds?: number;
  errorCode?: string;
};

export interface QueueDelivery<TMessage> {
  /** Stable message identity assigned by the queue adapter. */
  readonly id: string;
  /** Provider-decoded message body; consumers must validate its schema/version. */
  readonly body: TMessage;
  /** One-based delivery attempt count. */
  readonly attempts: number;
  /** Acknowledge only this active delivery lease. */
  ack(): void | Promise<void>;
  /** Release this active lease and schedule another attempt. */
  retry(options?: QueueRetryOptions): void | Promise<void>;
  /** Mark this delivery as invalid/permanently unprocessable. */
  deadLetter(errorCode: string): void | Promise<void>;
}

export interface QueueBatch<TMessage> {
  readonly queue: string;
  readonly messages: readonly QueueDelivery<TMessage>[];
}

export type QueueMessageHandler<TMessage> = (
  batch: QueueBatch<TMessage>,
) => Promise<void>;

export interface QueueConsumer {
  start(): Promise<void>;
  stop(options?: { timeoutMs?: number }): Promise<void>;
}

export type QueueHealth = {
  status: "healthy" | "degraded" | "unavailable";
  queueDepth?: number;
  oldestMessageAgeSeconds?: number;
  deadLetterCount?: number;
};

export interface QueueHealthProvider {
  health(queueName?: string): Promise<QueueHealth>;
}
