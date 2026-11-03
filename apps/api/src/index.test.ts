import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("./auth", () => ({
  createAuth: () => ({ api: { getSession: mocks.getSession } }),
}));

vi.mock("./database", () => ({
  withDatabase: async (_env: unknown, callback: (database: unknown) => Promise<Response>) => callback({
    select: mocks.select,
    insert: mocks.insert,
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
  it("rejects invalid verification tokens before querying the database", async () => {
    const response = await app.request("/api/v1/notification-channels/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "short" }),
    });
    expect(response.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
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
