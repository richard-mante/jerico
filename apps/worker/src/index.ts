import { isValidTelemetryMessage, writeToClickHouse } from "./telemetry";
import type { ClickHouseEnv, TelemetryMessage } from "./telemetry";
export { escapeIdentifier, isValidTelemetryMessage, toRow, writeToClickHouse } from "./telemetry";
export type { ClickHouseEnv, TelemetryEvent, TelemetryMessage } from "./telemetry";
import { adaptCloudflareQueueBatch } from "@jerico/queue/cloudflare";
import type { QueueBatch, QueueDelivery } from "@jerico/queue";
import { probeEndpoint } from "./uptime-probe";
import { deliverWebhook, isSafeWebhookUrl } from "./webhook-delivery";



export type UptimeProbeMessage = {
  schemaVersion: 1;
  type: "uptime.probe";
  checkId: string;
  monitorId: string;
  organizationId: string;
  projectId: string;
  url: string;
  method: "GET" | "HEAD";
  timeoutMs: number;
  expectedStatusCode: number;
};
export type EmailNotificationMessage = { schemaVersion: 1; type: "notification.email"; deliveryId: string; enqueueToken?: string; to: string; subject: string; text: string };
export type WebhookVerificationMessage = { schemaVersion: 1; type: "notification.webhook.verify"; channelId: string; url: string; challenge: string };
export type WebhookNotificationMessage = {
  schemaVersion: 1; type: "notification.webhook"; deliveryId: string; enqueueToken?: string; url: string;
  secretCiphertext: string; secretIv: string; eventType: "incident.opened" | "incident.acknowledged" | "incident.resolved" | "incident.reopened" | "incident.escalated";
  incidentId: string; projectId: string; title: string; triggerValue: number; occurredAt: string;
};
export type NotificationMessage = EmailNotificationMessage | WebhookVerificationMessage | WebhookNotificationMessage;

export type WorkerEnv = ClickHouseEnv & {
  API_URL?: string;
  UPTIME_RESULTS_SECRET?: string;
  PROBE_WORKER_HOST?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  NOTIFICATION_DELIVERY_SECRET?: string;
  WEBHOOK_ENCRYPTION_KEY?: string;
  PUBLIC_FETCHER?: typeof fetch;
  ALLOW_INTERNAL_API_HTTP?: string;
};

function createApiCallbackUrl(env: WorkerEnv, path: string, label: string): URL {
  if (!env.API_URL) throw new Error(label + " callback is not configured.");
  const url = new URL(path, env.API_URL);
  const secure = url.protocol === "https:";
  const privateComposeHttp = env.ALLOW_INTERNAL_API_HTTP === "true"
    && url.protocol === "http:"
    && url.hostname === "api"
    && url.port === "8787";
  if (!secure && !privateComposeHttp) {
    throw new Error(label + " callback must use HTTPS (or the explicitly enabled private Compose API endpoint).");
  }
  return url;
}

export function buildUptimeDeadLetterResult(message: UptimeProbeMessage, checkedAt = new Date().toISOString()) {
  return {
    checkId: message.checkId,
    monitorId: message.monitorId,
    organizationId: message.organizationId,
    projectId: message.projectId,
    status: "down" as const,
    statusCode: null,
    responseTimeMs: null,
    errorCode: "network_error" as const,
    checkedAt,
  };
}



async function processUptimeProbe(message: UptimeProbeMessage, env: WorkerEnv): Promise<void> {
  if (!env.API_URL || !env.UPTIME_RESULTS_SECRET || env.UPTIME_RESULTS_SECRET.length < 32 || !env.PROBE_WORKER_HOST) {
    throw new Error("Uptime result callback is not configured.");
  }
  const apiUrl = createApiCallbackUrl(env, "/internal/uptime-results", "Uptime result");
  const result = await probeEndpoint({
    url: message.url,
    method: message.method,
    timeoutMs: message.timeoutMs,
    expectedStatusCode: message.expectedStatusCode,
    blockedHosts: [env.PROBE_WORKER_HOST],
  }, env.PUBLIC_FETCHER ?? fetch);
  const callbackController = new AbortController();
  const callbackTimeout = setTimeout(() => callbackController.abort(), 10000);
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      redirect: "error",
      signal: callbackController.signal,
      headers: {
        "content-type": "application/json",
        "x-jerico-uptime-secret": env.UPTIME_RESULTS_SECRET,
      },
      body: JSON.stringify({
        checkId: message.checkId,
        monitorId: message.monitorId,
        organizationId: message.organizationId,
        projectId: message.projectId,
        ...result,
        checkedAt: new Date().toISOString(),
      }),
    });
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw new Error("Uptime result callback rejected with status " + response.status + ".");
  } finally {
    clearTimeout(callbackTimeout);
  }
}

async function processUptimeDeadLetterBatch(batch: QueueBatch<UptimeProbeMessage>, env: WorkerEnv): Promise<void> {
  for (const message of batch.messages) {
    const body = message.body;
    const valid = body?.schemaVersion === 1
      && body.type === "uptime.probe"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.checkId)
      && typeof body.monitorId === "string" && body.monitorId.length > 0 && body.monitorId.length <= 128
      && typeof body.organizationId === "string" && body.organizationId.length > 0 && body.organizationId.length <= 128
      && typeof body.projectId === "string" && body.projectId.length > 0 && body.projectId.length <= 128;
    if (!valid) {
      await message.ack();
      continue;
    }
    try {
      if (!env.API_URL || !env.UPTIME_RESULTS_SECRET || env.UPTIME_RESULTS_SECRET.length < 32) {
        throw new Error("Uptime dead-letter callback is not configured.");
      }
      const callbackUrl = createApiCallbackUrl(env, "/internal/uptime-results", "Uptime dead-letter");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(callbackUrl, {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-jerico-uptime-secret": env.UPTIME_RESULTS_SECRET,
          },
          body: JSON.stringify(buildUptimeDeadLetterResult(body)),
        });
        await response.body?.cancel().catch(() => undefined);
        if (!response.ok) throw new Error("Uptime dead-letter callback rejected with status " + response.status + ".");
      } finally {
        clearTimeout(timeout);
      }
      await message.ack();
    } catch (error) {
      console.error("Jerico uptime dead-letter finalization failed", {
        checkId: body.checkId,
        monitorId: body.monitorId,
        error: error instanceof Error ? error.message : String(error),
      });
      await message.retry({ delaySeconds: 60 });
    }
  }
}

async function processUptimeProbeBatch(batch: QueueBatch<UptimeProbeMessage>, env: WorkerEnv): Promise<void> {
  for (const message of batch.messages) {
    const body = message.body;
    const validMessage = body?.schemaVersion === 1
      && body.type === "uptime.probe"
      && /^[0-9a-f-]{36}$/i.test(body.checkId)
      && typeof body.monitorId === "string" && body.monitorId.length > 0 && body.monitorId.length <= 128
      && typeof body.organizationId === "string" && body.organizationId.length > 0 && body.organizationId.length <= 128
      && typeof body.projectId === "string" && body.projectId.length > 0 && body.projectId.length <= 128
      && typeof body.url === "string" && body.url.length <= 2048
      && (body.method === "GET" || body.method === "HEAD")
      && Number.isInteger(body.timeoutMs) && body.timeoutMs >= 1000 && body.timeoutMs <= 30000
      && Number.isInteger(body.expectedStatusCode) && body.expectedStatusCode >= 100 && body.expectedStatusCode <= 599;
    if (!validMessage) {
      await message.ack();
      continue;
    }
    try {
      await processUptimeProbe(body, env);
      await message.ack();
    } catch (error) {
      console.error("Jerico uptime probe processing failed", {
        checkId: body.checkId,
        monitorId: body.monitorId,
        error: error instanceof Error ? error.message : String(error),
      });
      await message.retry({ delaySeconds: 30 });
    }
  }
}


export function isValidNotificationMessage(value: unknown, blockedHost?: string): value is NotificationMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  if (message.schemaVersion !== 1) return false;
  if (message.type === "notification.email") {
    return typeof message.deliveryId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(message.deliveryId)
      && (message.enqueueToken === undefined || (typeof message.enqueueToken === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(message.enqueueToken)))
      && typeof message.to === "string" && message.to.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)
      && typeof message.subject === "string" && message.subject.length >= 1 && message.subject.length <= 200
      && typeof message.text === "string" && message.text.length >= 1 && message.text.length <= 10000;
  }
  if (message.type === "notification.webhook.verify") {
    return typeof message.channelId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(message.channelId)
      && typeof message.url === "string" && isSafeWebhookUrl(message.url, blockedHost)
      && typeof message.challenge === "string" && message.challenge.length >= 32 && message.challenge.length <= 128;
  }
  if (message.type === "notification.webhook") {
    return typeof message.deliveryId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(message.deliveryId)
      && (message.enqueueToken === undefined || (typeof message.enqueueToken === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(message.enqueueToken)))
      && typeof message.url === "string" && isSafeWebhookUrl(message.url, blockedHost)
      && typeof message.secretCiphertext === "string" && message.secretCiphertext.length >= 32 && message.secretCiphertext.length <= 512
      && typeof message.secretIv === "string" && message.secretIv.length >= 12 && message.secretIv.length <= 64
      && ["incident.opened", "incident.acknowledged", "incident.resolved", "incident.reopened", "incident.escalated"].includes(String(message.eventType))
      && typeof message.incidentId === "string" && message.incidentId.length <= 128
      && typeof message.projectId === "string" && message.projectId.length <= 128
      && typeof message.title === "string" && message.title.length >= 1 && message.title.length <= 200
      && typeof message.triggerValue === "number" && Number.isFinite(message.triggerValue)
      && typeof message.occurredAt === "string" && !Number.isNaN(Date.parse(message.occurredAt));
  }
  return false;
}

async function postNotificationResult(
  env: WorkerEnv,
  result: { deliveryId: string; enqueueToken?: string; attemptNumber: number; status: "attempting" | "sent" | "failed"; providerMessageId?: string; errorCode?: "provider_rejected" | "provider_unavailable" | "configuration_missing" | "invalid_message" },
 ): Promise<boolean> {
  if (!env.API_URL || !env.NOTIFICATION_DELIVERY_SECRET || env.NOTIFICATION_DELIVERY_SECRET.length < 32) {
    throw new Error("Notification result callback is not configured.");
  }
  const callbackUrl = createApiCallbackUrl(env, "/internal/notification-delivery-results", "Notification");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(callbackUrl, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-jerico-notification-secret": env.NOTIFICATION_DELIVERY_SECRET,
      },
      body: JSON.stringify(result),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("Notification result callback rejected.");
    }
    const payload = await response.json().catch(() => null) as { data?: { active?: boolean } } | null;
    return payload?.data?.active !== false;
  } finally {
    clearTimeout(timeout);
  }
}

async function processNotification(message: EmailNotificationMessage, env: WorkerEnv, attemptNumber: number): Promise<void> {
  const callbackIdentity = { deliveryId: message.deliveryId, ...(message.enqueueToken ? { enqueueToken: message.enqueueToken } : {}), attemptNumber };
  const active = await postNotificationResult(env, { ...callbackIdentity, status: "attempting" });
  if (!active) return;
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    const current = await postNotificationResult(env, { ...callbackIdentity, status: "failed", errorCode: "configuration_missing" });
    if (!current) return;
    throw new Error("Resend email delivery is not configured.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await (env.PUBLIC_FETCHER ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        authorization: "Bearer " + env.RESEND_API_KEY,
        "content-type": "application/json",
        "Idempotency-Key": message.deliveryId,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      const current = await postNotificationResult(env, { ...callbackIdentity, status: "failed", errorCode: "provider_rejected" });
      if (!current) return;
      throw new Error("Email provider rejected the notification.");
    }
    const payload = await response.json().catch(() => ({})) as { id?: unknown };
    await postNotificationResult(env, {
      ...callbackIdentity,
      status: "sent",
      ...(typeof payload.id === "string" ? { providerMessageId: payload.id.slice(0, 255) } : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Email provider rejected the notification.") throw error;
    const current = await postNotificationResult(env, { ...callbackIdentity, status: "failed", errorCode: "provider_unavailable" });
    if (!current) return;
    throw new Error("Email provider request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

async function postNotificationDeadLetterResult(
  env: WorkerEnv,
  message: EmailNotificationMessage | WebhookNotificationMessage,
): Promise<void> {
  if (!env.API_URL || !env.NOTIFICATION_DELIVERY_SECRET || env.NOTIFICATION_DELIVERY_SECRET.length < 32) {
    throw new Error("Notification dead-letter callback is not configured.");
  }
  const callbackUrl = createApiCallbackUrl(env, "/internal/notification-dead-letter-results", "Notification dead-letter");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(callbackUrl, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-jerico-notification-secret": env.NOTIFICATION_DELIVERY_SECRET,
      },
      body: JSON.stringify({
        deliveryId: message.deliveryId,
        ...(message.enqueueToken ? { enqueueToken: message.enqueueToken } : {}),
      }),
    });
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw new Error("Notification dead-letter callback rejected with status " + response.status + ".");
  } finally {
    clearTimeout(timeout);
  }
}

async function postWebhookVerificationResult(
  env: WorkerEnv,
  result: { channelId: string; challenge: string; status: "verified" | "failed"; errorCode?: "endpoint_rejected" | "endpoint_unavailable" | "invalid_response" },
  ignoreStale = false,
): Promise<void> {
  if (!env.API_URL || !env.NOTIFICATION_DELIVERY_SECRET || env.NOTIFICATION_DELIVERY_SECRET.length < 32) {
    throw new Error("Webhook verification callback is not configured.");
  }
  const callbackUrl = createApiCallbackUrl(env, "/internal/webhook-verification-results", "Webhook verification");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(callbackUrl, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { "content-type": "application/json", "x-jerico-notification-secret": env.NOTIFICATION_DELIVERY_SECRET },
      body: JSON.stringify(result),
    });
    if (ignoreStale && response.status === 409) {
      await response.body?.cancel().catch(() => undefined);
      return;
    }
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw new Error("Webhook verification callback rejected.");
  } finally { clearTimeout(timeout); }
}

async function readBoundedResponse(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Webhook verification response exceeded the size limit.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function processWebhookVerification(message: WebhookVerificationMessage, env: WorkerEnv): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await (env.PUBLIC_FETCHER ?? fetch)(message.url, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { "content-type": "application/json", "x-jerico-event": "webhook.verify" },
      body: JSON.stringify({ type: "jerico.webhook.verify", challenge: message.challenge }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      await postWebhookVerificationResult(env, { channelId: message.channelId, challenge: message.challenge, status: "failed", errorCode: "endpoint_rejected" });
      return;
    }
    const raw = await readBoundedResponse(response, 4096);
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { payload = null; }
    if (typeof payload !== "object" || payload === null || !("challenge" in payload) || payload.challenge !== message.challenge) {
      await postWebhookVerificationResult(env, { channelId: message.channelId, challenge: message.challenge, status: "failed", errorCode: "invalid_response" });
      return;
    }
    await postWebhookVerificationResult(env, { channelId: message.channelId, challenge: message.challenge, status: "verified" });
  } catch (error) {
    await postWebhookVerificationResult(env, { channelId: message.channelId, challenge: message.challenge, status: "failed", errorCode: "endpoint_unavailable" });
    throw new Error("Webhook verification endpoint is unavailable.");
  } finally { clearTimeout(timeout); }
}

async function processWebhookNotification(message: WebhookNotificationMessage, env: WorkerEnv, attemptNumber: number): Promise<void> {
  const callbackIdentity = { deliveryId: message.deliveryId, enqueueToken: message.enqueueToken, attemptNumber };
  const active = await postNotificationResult(env, { ...callbackIdentity, status: "attempting" });
  if (!active) return;
  try {
    await deliverWebhook({
      url: message.url,
      secretCiphertext: message.secretCiphertext,
      secretIv: message.secretIv,
      encryptionKey: env.WEBHOOK_ENCRYPTION_KEY,
      blockedHost: env.PROBE_WORKER_HOST,
      eventType: message.eventType,
      deliveryId: message.deliveryId,
      incidentId: message.incidentId,
      projectId: message.projectId,
      title: message.title,
      triggerValue: message.triggerValue,
      occurredAt: message.occurredAt,
      fetcher: env.PUBLIC_FETCHER,
    });
    await postNotificationResult(env, { ...callbackIdentity, status: "sent" });
  } catch (error) {
    const rejected = error instanceof Error && error.message === "Webhook endpoint rejected the event.";
    const current = await postNotificationResult(env, { ...callbackIdentity, status: "failed", errorCode: rejected ? "provider_rejected" : "provider_unavailable" });
    if (!current) return;
    throw new Error(rejected ? "Webhook endpoint rejected the event." : "Webhook delivery failed.");
  }
}

async function processNotificationDeadLetterBatch(batch: QueueBatch<NotificationMessage>, env: WorkerEnv): Promise<void> {
  for (const message of batch.messages) {
    if (!isValidNotificationMessage(message.body, env.PROBE_WORKER_HOST)) {
      await message.ack();
      continue;
    }
    try {
      if (message.body.type === "notification.webhook.verify") {
        await postWebhookVerificationResult(env, {
          channelId: message.body.channelId,
          challenge: message.body.challenge,
          status: "failed",
          errorCode: "endpoint_unavailable",
        }, true);
      } else {
        await postNotificationDeadLetterResult(env, message.body);
      }
      await message.ack();
    } catch (error) {
      console.error("Jerico notification dead-letter finalization failed", {
        ...(message.body.type === "notification.webhook.verify" ? { channelId: message.body.channelId } : { deliveryId: message.body.deliveryId }),
        error: error instanceof Error ? error.message : String(error),
      });
      await message.retry({ delaySeconds: 60 });
    }
  }
}

async function processNotificationBatch(batch: QueueBatch<NotificationMessage>, env: WorkerEnv): Promise<void> {
  for (const message of batch.messages) {
    if (!isValidNotificationMessage(message.body, env.PROBE_WORKER_HOST)) {
      await message.ack();
      continue;
    }
    try {
      if (message.body.type === "notification.email") await processNotification(message.body, env, message.attempts);
      else if (message.body.type === "notification.webhook.verify") await processWebhookVerification(message.body, env);
      else await processWebhookNotification(message.body, env, message.attempts);
      await message.ack();
    } catch (error) {
      console.error("Jerico notification delivery failed", {
        ...(message.body.type === "notification.webhook.verify" ? { channelId: message.body.channelId } : { deliveryId: message.body.deliveryId }),
        error: error instanceof Error ? error.message : String(error),
      });
      await message.retry({ delaySeconds: 60 });
    }
  }
}

export type SelfHostedQueueName =
  | "jerico-uptime-probes"
  | "jerico-notifications";

export async function processSelfHostedQueueDelivery(
  queueName: SelfHostedQueueName,
  delivery: QueueDelivery<UptimeProbeMessage | NotificationMessage>,
  env: WorkerEnv,
): Promise<void> {
  const batch = { queue: queueName, messages: [delivery] };
  if (queueName === "jerico-uptime-probes") {
    await processUptimeProbeBatch(batch as QueueBatch<UptimeProbeMessage>, env);
    return;
  }
  await processNotificationBatch(batch as QueueBatch<NotificationMessage>, env);
}

export default {
  async queue(batch: MessageBatch<TelemetryMessage | UptimeProbeMessage | NotificationMessage>, env: WorkerEnv): Promise<void> {
    const queueBatch = adaptCloudflareQueueBatch(batch);
    if (batch.queue === "jerico-notifications-dlq") {
      await processNotificationDeadLetterBatch(queueBatch as QueueBatch<NotificationMessage>, env);
      return;
    }
    if (batch.queue === "jerico-uptime-probes-dlq") {
      await processUptimeDeadLetterBatch(queueBatch as QueueBatch<UptimeProbeMessage>, env);
      return;
    }
    if (batch.queue === "jerico-notifications") {
      await processNotificationBatch(queueBatch as QueueBatch<NotificationMessage>, env);
      return;
    }
    if (batch.queue === "jerico-uptime-probes") {
      await processUptimeProbeBatch(queueBatch as QueueBatch<UptimeProbeMessage>, env);
      return;
    }
    const telemetryBatch = queueBatch as QueueBatch<TelemetryMessage>;
    const valid: QueueDelivery<TelemetryMessage>[] = [];
    for (const message of telemetryBatch.messages) {
      if (!isValidTelemetryMessage(message.body)) {
        console.error("Discarding invalid Jerico telemetry queue message", {
          queueMessageId: message.id,
        });
        await message.ack();
      } else {
        valid.push(message);
      }
    }
    if (!valid.length) return;
    try {
      await writeToClickHouse(env, valid.map((message) => message.body));
      for (const message of valid) await message.ack();
    } catch (error) {
      console.error("Jerico telemetry batch write failed", {
        messageCount: valid.length,
        error: error instanceof Error ? error.message : String(error),
      });
      for (const message of valid) await message.retry({ delaySeconds: 30 });
    }
  },
};
