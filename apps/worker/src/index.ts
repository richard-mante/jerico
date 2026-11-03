import { probeEndpoint } from "./uptime-probe";
import { deliverWebhook, isSafeWebhookUrl } from "./webhook-delivery";

type TelemetryEvent = {
  eventId?: string;
  type: "event" | "error" | "log" | "metric" | "span";
  name: string;
  timestamp?: string;
  message?: string;
  value?: number;
  attributes?: Record<string, string | number | boolean | null>;
};
type TelemetryMessage = {
  schemaVersion: 1;
  requestId: string;
  credentialId: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  acceptedAt: string;
  events: TelemetryEvent[];
};
type UptimeProbeMessage = {
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
type EmailNotificationMessage = { schemaVersion: 1; type: "notification.email"; deliveryId: string; enqueueToken?: string; to: string; subject: string; text: string };
type WebhookVerificationMessage = { schemaVersion: 1; type: "notification.webhook.verify"; channelId: string; url: string; challenge: string };
type WebhookNotificationMessage = {
  schemaVersion: 1; type: "notification.webhook"; deliveryId: string; enqueueToken?: string; url: string;
  secretCiphertext: string; secretIv: string; eventType: "incident.opened" | "incident.acknowledged" | "incident.resolved";
  incidentId: string; projectId: string; title: string; triggerValue: number; occurredAt: string;
};
type NotificationMessage = EmailNotificationMessage | WebhookVerificationMessage | WebhookNotificationMessage;
type ClickHouseEnv = {
  CLICKHOUSE_URL?: string;
  CLICKHOUSE_DATABASE?: string;
  CLICKHOUSE_TABLE?: string;
  CLICKHOUSE_USERNAME?: string;
  CLICKHOUSE_PASSWORD?: string;
  CLICKHOUSE_TOKEN?: string;
};
type WorkerEnv = ClickHouseEnv & {
  API_URL?: string;
  UPTIME_RESULTS_SECRET?: string;
  PROBE_WORKER_HOST?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  NOTIFICATION_DELIVERY_SECRET?: string;
  WEBHOOK_ENCRYPTION_KEY?: string;
};

export function escapeIdentifier(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error("Invalid ClickHouse identifier.");
  return value;
}
export function toRow(message: TelemetryMessage, event: TelemetryEvent, eventIndex = 0) {
  return {
    // Legacy schemaVersion 1 messages already in the queue have no eventId.
    // requestId + index is stable across redelivery of the same envelope.
    event_id: event.eventId ?? `legacy:${message.requestId}:${eventIndex}`,
    timestamp: event.timestamp ?? message.acceptedAt,
    accepted_at: message.acceptedAt,
    organization_id: message.organizationId,
    project_id: message.projectId,
    environment_id: message.environmentId,
    credential_id: message.credentialId,
    request_id: message.requestId,
    event_type: event.type,
    name: event.name,
    message: event.message ?? "",
    value: event.value ?? null,
    attributes: JSON.stringify(event.attributes ?? {}),
  };
}

export async function writeToClickHouse(env: ClickHouseEnv, messages: TelemetryMessage[]) {
  if (!env.CLICKHOUSE_URL) throw new Error("CLICKHOUSE_URL is not configured.");
  const database = escapeIdentifier(env.CLICKHOUSE_DATABASE ?? "jerico");
  const table = escapeIdentifier(env.CLICKHOUSE_TABLE ?? "telemetry_events");
  const rows = messages.flatMap((message) => message.events.map((event, index) => toRow(message, event, index)));
  if (!rows.length) return;
  const url = new URL(env.CLICKHOUSE_URL);
  url.searchParams.set("query", `INSERT INTO ${database}.${table} FORMAT JSONEachRow`);
  url.searchParams.set("max_execution_time", "8");
  const headers = new Headers({ "content-type": "application/x-ndjson" });
  if (env.CLICKHOUSE_TOKEN) headers.set("authorization", `Bearer ${env.CLICKHOUSE_TOKEN}`);
  else if (env.CLICKHOUSE_USERNAME || env.CLICKHOUSE_PASSWORD) {
    headers.set("authorization", "Basic " + btoa(`${env.CLICKHOUSE_USERNAME ?? "default"}:${env.CLICKHOUSE_PASSWORD ?? ""}`));
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(10_000),
    body: rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    throw new Error(`ClickHouse insert failed (${response.status}): ${detail}`);
  }
}

async function processUptimeProbe(message: UptimeProbeMessage, env: WorkerEnv): Promise<void> {
  if (!env.API_URL || !env.UPTIME_RESULTS_SECRET || env.UPTIME_RESULTS_SECRET.length < 32 || !env.PROBE_WORKER_HOST) {
    throw new Error("Uptime result callback is not configured.");
  }
  const apiUrl = new URL("/internal/uptime-results", env.API_URL);
  if (apiUrl.protocol !== "https:") throw new Error("Uptime result callback must use HTTPS.");
  const result = await probeEndpoint({
    url: message.url,
    method: message.method,
    timeoutMs: message.timeoutMs,
    expectedStatusCode: message.expectedStatusCode,
    blockedHosts: [env.PROBE_WORKER_HOST],
  });
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

async function processUptimeProbeBatch(batch: MessageBatch<UptimeProbeMessage>, env: WorkerEnv): Promise<void> {
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
      message.ack();
      continue;
    }
    try {
      await processUptimeProbe(body, env);
      message.ack();
    } catch (error) {
      console.error("Jerico uptime probe processing failed", {
        checkId: body.checkId,
        monitorId: body.monitorId,
        error: error instanceof Error ? error.message : String(error),
      });
      message.retry({ delaySeconds: 30 });
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
      && typeof message.enqueueToken === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(message.enqueueToken)
      && typeof message.url === "string" && isSafeWebhookUrl(message.url, blockedHost)
      && typeof message.secretCiphertext === "string" && message.secretCiphertext.length >= 32 && message.secretCiphertext.length <= 512
      && typeof message.secretIv === "string" && message.secretIv.length >= 12 && message.secretIv.length <= 64
      && ["incident.opened", "incident.acknowledged", "incident.resolved"].includes(String(message.eventType))
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
  const callbackUrl = new URL("/internal/notification-delivery-results", env.API_URL);
  if (callbackUrl.protocol !== "https:") throw new Error("Notification callback must use HTTPS.");
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
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw new Error("Notification result callback rejected.");
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
    await postNotificationResult(env, { ...callbackIdentity, status: "failed", errorCode: "configuration_missing" });
    throw new Error("Resend email delivery is not configured.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
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
      await postNotificationResult(env, { ...callbackIdentity, status: "failed", errorCode: "provider_rejected" });
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
    await postNotificationResult(env, { ...callbackIdentity, status: "failed", errorCode: "provider_unavailable" });
    throw new Error("Email provider request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

async function postWebhookVerificationResult(
  env: WorkerEnv,
  result: { channelId: string; challenge: string; status: "verified" | "failed"; errorCode?: "endpoint_rejected" | "endpoint_unavailable" | "invalid_response" },
): Promise<void> {
  if (!env.API_URL || !env.NOTIFICATION_DELIVERY_SECRET || env.NOTIFICATION_DELIVERY_SECRET.length < 32) {
    throw new Error("Webhook verification callback is not configured.");
  }
  const callbackUrl = new URL("/internal/webhook-verification-results", env.API_URL);
  if (callbackUrl.protocol !== "https:") throw new Error("Webhook verification callback must use HTTPS.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(callbackUrl, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { "content-type": "application/json", "x-jerico-notification-secret": env.NOTIFICATION_DELIVERY_SECRET },
      body: JSON.stringify(result),
    });
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
    const response = await fetch(message.url, {
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
    });
    await postNotificationResult(env, { ...callbackIdentity, status: "sent" });
  } catch (error) {
    const rejected = error instanceof Error && error.message === "Webhook endpoint rejected the event.";
    await postNotificationResult(env, { ...callbackIdentity, status: "failed", errorCode: rejected ? "provider_rejected" : "provider_unavailable" });
    throw new Error(rejected ? "Webhook endpoint rejected the event." : "Webhook delivery failed.");
  }
}

async function processNotificationBatch(batch: MessageBatch<NotificationMessage>, env: WorkerEnv): Promise<void> {
  for (const message of batch.messages) {
    if (!isValidNotificationMessage(message.body, env.PROBE_WORKER_HOST)) {
      message.ack();
      continue;
    }
    try {
      if (message.body.type === "notification.email") await processNotification(message.body, env, message.attempts);
      else if (message.body.type === "notification.webhook.verify") await processWebhookVerification(message.body, env);
      else await processWebhookNotification(message.body, env, message.attempts);
      message.ack();
    } catch (error) {
      console.error("Jerico notification delivery failed", {
        ...(message.body.type === "notification.webhook.verify" ? { channelId: message.body.channelId } : { deliveryId: message.body.deliveryId }),
        error: error instanceof Error ? error.message : String(error),
      });
      message.retry({ delaySeconds: 60 });
    }
  }
}

export default {
  async queue(batch: MessageBatch<TelemetryMessage | UptimeProbeMessage | NotificationMessage>, env: WorkerEnv): Promise<void> {
    if (batch.queue === "jerico-notifications") {
      await processNotificationBatch(batch as MessageBatch<NotificationMessage>, env);
      return;
    }
    if (batch.queue === "jerico-uptime-probes") {
      await processUptimeProbeBatch(batch as MessageBatch<UptimeProbeMessage>, env);
      return;
    }
    const telemetryBatch = batch as MessageBatch<TelemetryMessage>;
    const valid: Message<TelemetryMessage>[] = [];
    for (const message of telemetryBatch.messages) {
      if (message.body?.schemaVersion !== 1 || !Array.isArray(message.body.events)) {
        message.ack();
      } else {
        valid.push(message);
      }
    }
    if (!valid.length) return;
    try {
      await writeToClickHouse(env, valid.map((message) => message.body));
      for (const message of valid) message.ack();
    } catch (error) {
      console.error("Jerico telemetry batch write failed", {
        messageCount: valid.length,
        error: error instanceof Error ? error.message : String(error),
      });
      for (const message of valid) message.retry({ delaySeconds: 30 });
    }
  },
};
