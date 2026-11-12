import type { QueueDelivery } from "./index";

export type QueueClaimer<TMessage> = {
  claim(limit?: number, visibilityTimeoutSeconds?: number): Promise<{
    queue: string;
    messages: readonly QueueDelivery<TMessage>[];
  }>;
};

export type QueueJobHandler<TMessage> = (delivery: QueueDelivery<TMessage>) => Promise<void>;

export type PollingQueueConsumerOptions = {
  batchSize?: number;
  visibilityTimeoutSeconds?: number;
  pollIntervalMs?: number;
  onError?: (error: unknown, messageId?: string) => void;
};

/**
 * Portable polling consumer for durable queue adapters. Each message is
 * processed independently so one failing job cannot retry its whole batch.
 */
export class PollingQueueConsumer<TMessage> {
  private readonly claimer: QueueClaimer<TMessage>;
  private readonly handler: QueueJobHandler<TMessage>;
  private readonly batchSize: number;
  private readonly visibilityTimeoutSeconds: number;
  private readonly pollIntervalMs: number;
  private readonly onError: (error: unknown, messageId?: string) => void;
  private stopping = true;
  private loopPromise: Promise<void> | null = null;

  constructor(
    claimer: QueueClaimer<TMessage>,
    handler: QueueJobHandler<TMessage>,
    options: PollingQueueConsumerOptions = {},
  ) {
    this.claimer = claimer;
    this.handler = handler;
    this.batchSize = bounded(options.batchSize ?? 10, 1, 100, "batchSize");
    this.visibilityTimeoutSeconds = bounded(options.visibilityTimeoutSeconds ?? 60, 1, 3_600, "visibilityTimeoutSeconds");
    this.pollIntervalMs = bounded(options.pollIntervalMs ?? 1_000, 100, 30_000, "pollIntervalMs");
    this.onError = options.onError ?? ((error, messageId) => {
      console.error("Jerico queue consumer error", {
        messageId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    });
  }

  async start(): Promise<void> {
    if (this.loopPromise) return;
    this.stopping = false;
    this.loopPromise = this.run().finally(() => {
      this.loopPromise = null;
      this.stopping = true;
    });
  }

  async stop(options: { timeoutMs?: number } = {}): Promise<void> {
    this.stopping = true;
    const running = this.loopPromise;
    if (!running) return;
    const timeoutMs = bounded(options.timeoutMs ?? 30_000, 1, 300_000, "stop timeout");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        running,
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, timeoutMs);
        }),
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  private async run(): Promise<void> {
    while (!this.stopping) {
      try {
        const batch = await this.claimer.claim(this.batchSize, this.visibilityTimeoutSeconds);
        if (batch.messages.length === 0) {
          await sleep(this.pollIntervalMs);
          continue;
        }
        await Promise.all(batch.messages.map((message) => this.process(message)));
      } catch (error) {
        this.onError(error);
        await sleep(this.pollIntervalMs);
      }
    }
  }

  private async process(message: QueueDelivery<TMessage>): Promise<void> {
    let settled = false;
    const delivery: QueueDelivery<TMessage> = {
      id: message.id,
      body: message.body,
      attempts: message.attempts,
      ack: async () => {
        await message.ack();
        settled = true;
      },
      retry: async (options) => {
        await message.retry(options);
        settled = true;
      },
      deadLetter: async (errorCode) => {
        await message.deadLetter(errorCode);
        settled = true;
      },
    };

    try {
      await this.handler(delivery);
      if (!settled) await delivery.ack();
    } catch (error) {
      this.onError(error, message.id);
      if (!settled) {
        try {
          await delivery.retry({ errorCode: "handler_error" });
        } catch (retryError) {
          this.onError(retryError, message.id);
        }
      }
    }
  }
}

function bounded(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(label + " is outside the supported range.");
  }
  return value;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
