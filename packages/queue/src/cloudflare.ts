import type { QueueBatch, QueueDelivery, QueueRetryOptions } from "./index";

/**
 * Structural subset of Cloudflare Queue delivery types. Keeping this adapter
 * free of the Workers type package lets the shared queue contract compile in
 * Node/self-hosted runtimes as well.
 */
export type CloudflareQueueMessage<TMessage> = {
  id: string;
  body: TMessage;
  attempts: number;
  ack(): void;
  retry(options?: QueueRetryOptions): void;
};

export type CloudflareQueueBatch<TMessage> = {
  queue: string;
  messages: CloudflareQueueMessage<TMessage>[];
};

export function adaptCloudflareQueueBatch<TMessage>(
  batch: CloudflareQueueBatch<TMessage>,
): QueueBatch<TMessage> {
  const messages: QueueDelivery<TMessage>[] = batch.messages.map((message) => ({
    id: message.id,
    body: message.body,
    attempts: message.attempts,
    ack: () => message.ack(),
    retry: (options) => message.retry(options ? { delaySeconds: options.delaySeconds } : undefined),
  }));

  return { queue: batch.queue, messages };
}
