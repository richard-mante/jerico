import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("./auth", () => ({
  createAuth: () => ({ api: { getSession: mocks.getSession } }),
}));

vi.mock("./database", () => ({
  withDatabase: async (_env: unknown, callback: (database: unknown) => Promise<Response>) => callback({
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
  }),
}));

import { app } from "./index";

function setSelectResults(...results: unknown[][]) {
  const pending = [...results];
  mocks.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: async () => pending.shift() ?? [],
      }),
    }),
  }));
}

describe("project observability route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "user-a" },
      session: { activeOrganizationId: "org-a" },
    });
    mocks.update.mockReset();
    mocks.insert.mockReturnValue({
      values: () => ({ onConflictDoUpdate: async () => ({}) }),
    });
  });

  it("rejects unauthenticated telemetry requests before querying tenant data", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await app.request("/api/v1/projects/project-a/telemetry/errors/groups", { method: "GET" });
    expect(response.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("does not allow organization members to change error group status", async () => {
    setSelectResults([{ role: "member" }]);
    const response = await app.request("/api/v1/projects/project-a/telemetry/errors/groups/123456/status", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jerico-organization-id": "org-a" },
      body: JSON.stringify({ status: "resolved" }),
    });
    expect(response.status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not reveal a project outside the active organization", async () => {
    setSelectResults([{ role: "member" }], []);
    const response = await app.request("/api/v1/projects/project-from-org-b/telemetry/errors/groups", {
      method: "GET",
      headers: { "x-jerico-organization-id": "org-a" },
    });
    expect(response.status).toBe(404);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("allows an organization owner to update a group status", async () => {
    setSelectResults([{ role: "owner" }], [{ id: "project-a" }]);
    const response = await app.request("/api/v1/projects/project-a/telemetry/errors/groups/123456/status", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jerico-organization-id": "org-a" },
      body: JSON.stringify({ status: "resolved" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({ data: { fingerprint: "123456", status: "resolved" } });
  });
  it("does not expose route performance for a project outside the active organization", async () => {
    setSelectResults([{ role: "member" }], []);
    const response = await app.request("/api/v1/projects/project-from-org-b/telemetry/metrics/routes", {
      method: "GET",
      headers: { "x-jerico-organization-id": "org-a" },
    });
    expect(response.status).toBe(404);
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it("does not expose uptime monitors for a project outside the active organization", async () => {
    setSelectResults([{ role: "member" }], []);
    const response = await app.request("/api/v1/projects/project-from-org-b/uptime-monitors", {
      method: "GET",
      headers: { "x-jerico-organization-id": "org-a" },
    });
    expect(response.status).toBe(404);
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it("rejects uptime result callbacks without the shared internal secret", async () => {
    const response = await app.request("/internal/uptime-results", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jerico-uptime-secret": "incorrect" },
      body: "{}",
    }, { UPTIME_RESULTS_SECRET: "s".repeat(40) });
    expect(response.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("validates internal uptime result payloads before touching the database", async () => {
    const secret = "s".repeat(40);
    const response = await app.request("/internal/uptime-results", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jerico-uptime-secret": secret },
      body: JSON.stringify({ checkId: "invalid" }),
    }, { UPTIME_RESULTS_SECRET: secret });
    expect(response.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });

});


describe("alert rule route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-a" }, session: { activeOrganizationId: "org-a" } });
  });

  it("does not allow members to create alert rules", async () => {
    setSelectResults([{ role: "member" }]);
    const response = await app.request("/api/v1/projects/project-a/alert-rules", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jerico-organization-id": "org-a" },
      body: JSON.stringify({ name: "High errors", metric: "error_count", threshold: 10 }),
    });
    expect(response.status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("revokes an in-flight evaluation lease when an alert rule is edited", async () => {
    setSelectResults([{ role: "owner" }], [{ id: "project-a" }]);
    const updatedRule = { id: "rule-a", name: "Updated rule", consecutiveCount: 0 };
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: async () => [updatedRule],
      }),
    });
    mocks.update.mockReturnValue({ set });
    const response = await app.request("/api/v1/projects/project-a/alert-rules/rule-a", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-jerico-organization-id": "org-a" },
      body: JSON.stringify({ name: "Updated rule" }),
    });
    expect(response.status).toBe(200);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      consecutiveCount: 0,
      evaluationLeaseToken: null,
      evaluationLeaseExpiresAt: null,
    }));
  });

  it("does not reveal alert rules for a project outside the active organization", async () => {
    setSelectResults([{ role: "member" }], []);
    const response = await app.request("/api/v1/projects/project-from-org-b/alert-rules", {
      method: "GET",
      headers: { "x-jerico-organization-id": "org-a" },
    });
    expect(response.status).toBe(404);
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });
});


describe("notification channel authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-a" }, session: { activeOrganizationId: "org-a" } });
  });
  it("does not allow members to create organization notification channels", async () => {
    setSelectResults([{ role: "member" }]);
    const response = await app.request("/api/v1/notification-channels", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jerico-organization-id": "org-a" },
      body: JSON.stringify({ email: "ops@example.com" }),
    });
    expect(response.status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("does not allow organization members to create webhook channels", async () => {
    setSelectResults([{ role: "member" }]);
    const response = await app.request("/api/v1/notification-channels/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jerico-organization-id": "org-a" },
      body: JSON.stringify({ url: "https://hooks.example.com/jerico" }),
    });
    expect(response.status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("rejects invalid webhook targets before encryption or persistence", async () => {
    setSelectResults([{ role: "owner" }]);
    const response = await app.request("/api/v1/notification-channels/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jerico-organization-id": "org-a" },
      body: JSON.stringify({ url: "http://127.0.0.1/hook" }),
    }, { NOTIFICATIONS: { send: vi.fn() } });
    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("rejects invalid verification tokens before querying the database", async () => {
    const response = await app.request("/api/v1/notification-channels/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "short" }),
    });
    expect(response.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("atomically consumes the current email verification token", async () => {
    mocks.update.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: async () => [{ id: "channel-a" }],
        }),
      }),
    });
    const response = await app.request("/api/v1/notification-channels/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "v".repeat(43) }),
    });
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("rejects an email verification token replaced by a resend before consumption", async () => {
    mocks.update.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: async () => [],
        }),
      }),
    });
    const response = await app.request("/api/v1/notification-channels/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "v".repeat(43) }),
    });
    expect(response.status).toBe(400);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("accepts a repeated webhook verification callback after its challenge was consumed", async () => {
    const challenge = "v".repeat(43);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(challenge));
    const challengeHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    setSelectResults([{
      id: "550e8400-e29b-41d4-a716-446655440000",
      organizationId: "org-a",
      verifiedAt: new Date(),
      verificationTokenHash: null,
      verificationExpiresAt: null,
      lastVerificationChallengeHash: challengeHash,
    }]);
    const secret = "s".repeat(40);
    const response = await app.request("/internal/webhook-verification-results", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jerico-notification-secret": secret },
      body: JSON.stringify({
        channelId: "550e8400-e29b-41d4-a716-446655440000",
        challenge,
        status: "verified",
      }),
    }, { NOTIFICATION_DELIVERY_SECRET: secret });
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ data: { accepted: true } });
  });
  it("rejects delivery callbacks without the shared internal secret", async () => {
    const response = await app.request("/internal/notification-delivery-results", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jerico-notification-secret": "wrong" },
      body: JSON.stringify({}),
    }, { NOTIFICATION_DELIVERY_SECRET: "s".repeat(40) });
    expect(response.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});


describe("notification delivery callback attempt fencing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockReset();
  });

  it("records a new consumer attempt once with its enqueue token", async () => {
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: async () => [{ id: "delivery-a" }],
      }),
    });
    mocks.update.mockReturnValue({ set });
    const response = await app.request("/internal/notification-delivery-results", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jerico-notification-secret": "s".repeat(40) },
      body: JSON.stringify({
        deliveryId: "550e8400-e29b-41d4-a716-446655440000",
        enqueueToken: "550e8400-e29b-41d4-a716-446655440001",
        attemptNumber: 2,
        status: "attempting",
      }),
    }, { NOTIFICATION_DELIVERY_SECRET: "s".repeat(40) });
    expect(response.status).toBe(202);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      status: "queued",
      attempts: 2,
      activeConsumerAttempt: 2,
    }));
  });


  it("acknowledges duplicate attempting callbacks without incrementing again", async () => {
    mocks.update.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: async () => [],
        }),
      }),
    });
    setSelectResults([{
      id: "delivery-a",
      status: "queued",
      activeEnqueueToken: "550e8400-e29b-41d4-a716-446655440001",
      activeConsumerAttempt: 2,
    }]);
    const response = await app.request("/internal/notification-delivery-results", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jerico-notification-secret": "s".repeat(40) },
      body: JSON.stringify({
        deliveryId: "550e8400-e29b-41d4-a716-446655440000",
        enqueueToken: "550e8400-e29b-41d4-a716-446655440001",
        attemptNumber: 2,
        status: "attempting",
      }),
    }, { NOTIFICATION_DELIVERY_SECRET: "s".repeat(40) });
    expect(response.status).toBe(202);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("completes only the active notification consumer attempt", async () => {
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: async () => [{ id: "delivery-a" }],
      }),
    });
    mocks.update.mockReturnValue({ set });
    const response = await app.request("/internal/notification-delivery-results", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jerico-notification-secret": "s".repeat(40) },
      body: JSON.stringify({
        deliveryId: "550e8400-e29b-41d4-a716-446655440000",
        enqueueToken: "550e8400-e29b-41d4-a716-446655440001",
        attemptNumber: 2,
        status: "sent",
      }),
    }, { NOTIFICATION_DELIVERY_SECRET: "s".repeat(40) });
    expect(response.status).toBe(202);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: "sent" }));
  });

  it("ignores a failed callback from an earlier consumer attempt", async () => {
    mocks.update.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: async () => [],
        }),
      }),
    });
    setSelectResults([{
      id: "delivery-a",
      status: "queued",
      activeEnqueueToken: "550e8400-e29b-41d4-a716-446655440001",
      activeConsumerAttempt: 2,
    }]);
    const response = await app.request("/internal/notification-delivery-results", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jerico-notification-secret": "s".repeat(40) },
      body: JSON.stringify({
        deliveryId: "550e8400-e29b-41d4-a716-446655440000",
        enqueueToken: "550e8400-e29b-41d4-a716-446655440001",
        attemptNumber: 1,
        status: "failed",
        errorCode: "provider_unavailable",
      }),
    }, { NOTIFICATION_DELIVERY_SECRET: "s".repeat(40) });
    expect(response.status).toBe(202);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it("ignores callbacks from an enqueue token that has already been superseded", async () => {
    mocks.update.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: async () => [],
        }),
      }),
    });
    setSelectResults([{
      id: "delivery-a",
      status: "queued",
      activeEnqueueToken: "550e8400-e29b-41d4-a716-446655440002",
      activeConsumerAttempt: 1,
    }]);
    const response = await app.request("/internal/notification-delivery-results", {
      method: "POST",
      headers: { "content-type": "application/json", "x-jerico-notification-secret": "s".repeat(40) },
      body: JSON.stringify({
        deliveryId: "550e8400-e29b-41d4-a716-446655440000",
        enqueueToken: "550e8400-e29b-41d4-a716-446655440001",
        attemptNumber: 1,
        status: "failed",
        errorCode: "provider_unavailable",
      }),
    }, { NOTIFICATION_DELIVERY_SECRET: "s".repeat(40) });
    expect(response.status).toBe(202);
    expect((await response.json() as { data: { active: boolean } }).data.active).toBe(false);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });
});
