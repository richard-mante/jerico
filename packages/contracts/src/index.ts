export type EnvironmentName = "development" | "staging" | "production";

export type ApiError = {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
};

export type HealthStatus = {
  status: "ok" | "degraded";
  service: string;
  checks?: Record<string, "ok" | "degraded" | "not-configured">;
};

export const API_VERSION = "v1" as const;
