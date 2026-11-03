"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { authClient } from "../lib/auth-client";

type Organization = { id: string; name: string };
type Environment = { id: string; name: string; slug: string; isProduction: boolean };
type TelemetryItem = {
  eventId: string;
  timestamp: string;
  environmentId: string;
  eventType: string;
  name: string;
  message: string;
  value: number | null;
  attributes: string;
};
type EventSummary = { name: string; occurrences: number; lastSeen: string; latestEventId: string; latestMessage: string; latestAttributes: string };
type MetricPoint = { timestamp: string; average: number; minimum: number; maximum: number; samples: number };
type MetricSeries = { name: string; points: MetricPoint[] };
type ErrorGroup = {
  fingerprint: string;
  name: string;
  latestMessage: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  latestEventId: string;
  latestStack: string;
};
type Overview = {
  total: number;
  events: number;
  errors: number;
  logs: number;
  metrics: number;
  spans: number;
  lastEventAt: string | null;
};
type Tab = "events" | "errors" | "logs" | "metrics" | "spans";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
const tabs: { id: Tab; label: string }[] = [
  { id: "events", label: "Events" },
  { id: "errors", label: "Errors" },
  { id: "logs", label: "Logs" },
  { id: "metrics", label: "Metrics" },
  { id: "spans", label: "Traces" },
];
const emptyOverview: Overview = { total: 0, events: 0, errors: 0, logs: 0, metrics: 0, spans: 0, lastEventAt: null };

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium", timeStyle: "medium",
  }).format(date);
}

function metricLine(points: MetricPoint[]) {
  if (!points.length) return "";
  const values = points.map((point) => point.average);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  return points.map((point, index) => {
    const x = points.length === 1 ? 320 : 12 + (index / (points.length - 1)) * 616;
    const y = 144 - ((point.average - min) / spread) * 128;
    return `${x},${y}`;
  }).join(" ");
}
type SpanMetadata = { traceId?: string; spanId?: string; parentSpanId?: string };
function spanMetadata(row: TelemetryItem): SpanMetadata {
  try {
    const attributes: unknown = JSON.parse(row.attributes || "{}");
    if (typeof attributes !== "object" || attributes === null || Array.isArray(attributes)) return {};
    const value = attributes as Record<string, unknown>;
    return { traceId: typeof value.traceId === "string" ? value.traceId : undefined, spanId: typeof value.spanId === "string" ? value.spanId : undefined, parentSpanId: typeof value.parentSpanId === "string" ? value.parentSpanId : undefined };
  } catch { return {}; }
}
export function ProjectObservability({ initialOrganizationId }: { initialOrganizationId: string }) {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { data: organizations, isPending: organizationsPending } = authClient.useListOrganizations();
  const [organizationId, setOrganizationId] = useState(initialOrganizationId);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [environmentId, setEnvironmentId] = useState("");
  const [tab, setTab] = useState<Tab>("events");
  const [rangeHours, setRangeHours] = useState("24");
  const [logLevel, setLogLevel] = useState("all");
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [rows, setRows] = useState<TelemetryItem[]>([]);
  const [errorGroups, setErrorGroups] = useState<ErrorGroup[]>([]);
  const [eventCatalogue, setEventCatalogue] = useState<EventSummary[]>([]);
  const [metricSeries, setMetricSeries] = useState<MetricSeries[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const organizationList = useMemo(() => (organizations ?? []) as Organization[], [organizations]);

  const traceGroups = useMemo(() => {
    const grouped = new Map<string, { traceId: string | null; spans: TelemetryItem[] }>();
    for (const row of rows) {
      const traceId = spanMetadata(row).traceId ?? null;
      const key = traceId ?? ("standalone:" + row.eventId);
      const current = grouped.get(key) ?? { traceId, spans: [] };
      current.spans.push(row); grouped.set(key, current);
    }
    return Array.from(grouped.values()).map((group) => ({ ...group, spans: [...group.spans].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) }));
  }, [rows]);

  useEffect(() => {
    if (organizationList.length && (!organizationId || !organizationList.some((item) => item.id === organizationId))) {
      setOrganizationId(organizationList[0].id);
    }
  }, [organizationId, organizationList]);

  useEffect(() => {
    if (!organizationId || !session) return;
    void authClient.organization.setActive({ organizationId });
    const controller = new AbortController();
    void fetch(`${apiBase}/api/v1/projects/${encodeURIComponent(projectId)}/environments`, {
      credentials: "include",
      headers: { "X-Jerico-Organization-Id": organizationId },
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not load environments.");
      const items = (payload.data ?? []) as Environment[];
      setEnvironments(items);
      if (environmentId && !items.some((item) => item.id === environmentId)) setEnvironmentId("");
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load environments.");
    });
    return () => controller.abort();
  }, [organizationId, projectId, session, environmentId]);

  const queryWindow = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - Number(rangeHours) * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [rangeHours]);

  useEffect(() => {
    if (!organizationId || !session) return;
    const controller = new AbortController();
    const headers = { "X-Jerico-Organization-Id": organizationId };
    const query = new URLSearchParams({ from: queryWindow.from, to: queryWindow.to });
    if (environmentId) query.set("environmentId", environmentId);
    if (tab === "logs" && logLevel !== "all") query.set("level", logLevel);
    setLoading(true);
    setError("");
    setNextCursor(null);
    void Promise.all([
      fetch(`${apiBase}/api/v1/projects/${encodeURIComponent(projectId)}/telemetry/overview?${query}`, {
        credentials: "include", headers, signal: controller.signal,
      }),
      fetch(`${apiBase}/api/v1/projects/${encodeURIComponent(projectId)}/telemetry/${tab === "errors" ? "errors/groups" : tab === "metrics" ? "metrics/series" : tab === "events" ? "events/catalogue" : tab}?${query}&limit=50`, {
        credentials: "include", headers, signal: controller.signal,
      }),
    ]).then(async ([overviewResponse, listResponse]) => {
      const overviewPayload = await overviewResponse.json();
      const listPayload = await listResponse.json();
      if (!overviewResponse.ok) throw new Error(overviewPayload.error?.message ?? "Could not load project overview.");
      if (!listResponse.ok) throw new Error(listPayload.error?.message ?? "Could not load telemetry.");
      setOverview(overviewPayload.data as Overview);
      if (tab === "errors") {
        setErrorGroups((listPayload.data ?? []) as ErrorGroup[]);
        setEventCatalogue([]);
        setMetricSeries([]);
        setRows([]);
        setNextCursor(null);
      } else if (tab === "metrics") {
        setMetricSeries((listPayload.data ?? []) as MetricSeries[]);
        setErrorGroups([]);
        setEventCatalogue([]);
        setRows([]);
        setNextCursor(null);
      } else if (tab === "events") {
        setEventCatalogue((listPayload.data ?? []) as EventSummary[]);
        setErrorGroups([]);
        setMetricSeries([]);
        setRows([]);
        setNextCursor(null);
      } else {
        setRows((listPayload.data ?? []) as TelemetryItem[]);
        setErrorGroups([]);
        setEventCatalogue([]);
        setMetricSeries([]);
        setNextCursor(listPayload.pagination?.nextCursor ?? null);
      }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) {
        setRows([]);
        setErrorGroups([]);
        setEventCatalogue([]);
        setMetricSeries([]);
        setOverview(emptyOverview);
        setError(cause instanceof Error ? cause.message : "Could not load telemetry.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [organizationId, session, projectId, tab, environmentId, queryWindow, logLevel]);

  async function loadMore() {
    if (!organizationId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const query = new URLSearchParams({ from: queryWindow.from, to: queryWindow.to, limit: "50", cursor: nextCursor });
      if (environmentId) query.set("environmentId", environmentId);
      if (tab === "logs" && logLevel !== "all") query.set("level", logLevel);
      const response = await fetch(`${apiBase}/api/v1/projects/${encodeURIComponent(projectId)}/telemetry/${tab}?${query}`, {
        credentials: "include",
        headers: { "X-Jerico-Organization-Id": organizationId },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not load the next page.");
      setRows((current) => [...current, ...((payload.data ?? []) as TelemetryItem[])]);
      setNextCursor(payload.pagination?.nextCursor ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the next page.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (sessionPending || organizationsPending) {
    return <main className="flex min-h-screen items-center justify-center bg-[#090b10] text-sm text-[#929aaa]">Loading your workspace…</main>;
  }
  if (!session) {
    return <main className="flex min-h-screen items-center justify-center bg-[#090b10] px-6 text-[#f5f7fb]"><div className="text-center"><h1 className="text-2xl font-semibold">Sign in to continue</h1><Link href="/sign-in" className="mt-5 inline-flex rounded-xl bg-[#d9f36a] px-4 py-3 text-sm font-semibold text-[#15190b]">Sign in</Link></div></main>;
  }
  if (!organizationList.length) {
    return <main className="min-h-screen bg-[#090b10] px-6 py-12 text-[#f5f7fb]"><p>No organization is available for this account.</p><Link className="mt-4 inline-block text-[#d9f36a]" href="/dashboard">Return to dashboard</Link></main>;
  }

  const stats = [
    { label: "All signals", value: overview.total },
    { label: "Events", value: overview.events },
    { label: "Errors", value: overview.errors },
    { label: "Logs", value: overview.logs },
    { label: "Metrics", value: overview.metrics },
    { label: "Spans", value: overview.spans },
  ];

  return (
    <main className="min-h-screen bg-[#090b10] px-5 py-7 text-[#f5f7fb] sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <Link href="/dashboard" className="flex items-center gap-3 text-lg font-semibold"><span className="grid size-9 place-items-center rounded-xl bg-[#d9f36a] text-sm font-black text-[#15190b]">J</span>jerico</Link>
          <div className="flex items-center gap-3 text-sm text-[#a8afbd]"><span>{session.user.name}</span><button onClick={() => authClient.signOut()} className="hover:text-white">Sign out</button></div>
        </header>

        <section className="flex flex-col gap-5 py-9 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/dashboard" className="text-xs text-[#8d96a5] hover:text-white">Projects</Link>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#d9f36a]">Project observability</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Telemetry overview</h1>
            <p className="mt-2 text-sm text-[#929aaa]">Project <span className="font-mono text-[#c8ced8]">{projectId.slice(0, 12)}</span></p>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="space-y-1.5 text-xs text-[#929aaa]"><span>Workspace</span><select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="block min-w-44 rounded-xl border border-white/10 bg-[#111620] px-3 py-2.5 text-sm text-white">{organizationList.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
            <label className="space-y-1.5 text-xs text-[#929aaa]"><span>Environment</span><select value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)} className="block min-w-40 rounded-xl border border-white/10 bg-[#111620] px-3 py-2.5 text-sm text-white"><option value="">All environments</option>{environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}</select></label>
            <label className="space-y-1.5 text-xs text-[#929aaa]"><span>Time range</span><select value={rangeHours} onChange={(event) => setRangeHours(event.target.value)} className="block min-w-32 rounded-xl border border-white/10 bg-[#111620] px-3 py-2.5 text-sm text-white"><option value="1">Last hour</option><option value="24">Last 24 hours</option><option value="168">Last 7 days</option><option value="720">Last 30 days</option></select></label>
            {tab === "logs" && <label className="space-y-1.5 text-xs text-[#929aaa]"><span>Severity</span><select value={logLevel} onChange={(event) => setLogLevel(event.target.value)} className="block min-w-32 rounded-xl border border-white/10 bg-[#111620] px-3 py-2.5 text-sm text-white"><option value="all">All levels</option><option value="debug">Debug</option><option value="info">Info</option><option value="warn">Warning</option><option value="error">Error</option><option value="fatal">Fatal</option></select></label>}
          </div>
        </section>

        {error && <p role="alert" className="mb-5 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</p>}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {stats.map((stat) => <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="text-xs text-[#8f98a7]">{stat.label}</p><p className="mt-3 text-2xl font-semibold tabular-nums">{stat.value.toLocaleString()}</p></div>)}
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div><h2 className="font-semibold">Signal explorer</h2><p className="mt-1 text-xs text-[#7f8998]">Latest matching telemetry from ClickHouse</p></div>
            <div className="flex flex-wrap gap-1 rounded-xl bg-black/20 p-1">{tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`rounded-lg px-3 py-2 text-xs font-medium transition ${tab === item.id ? "bg-[#d9f36a] text-[#15190b]" : "text-[#9ba4b2] hover:text-white"}`}>{item.label}</button>)}</div>
          </div>
          {loading ? <div className="px-5 py-16 text-center text-sm text-[#8f98a7]">Loading telemetry…</div> : tab === "spans" && rows.length ? (
            <div className="space-y-4 p-4">
              {traceGroups.map((group) => {
                const start = Math.min(...group.spans.map((span) => new Date(span.timestamp).getTime() - Math.max(0, span.value ?? 0)));
                const end = Math.max(...group.spans.map((span) => new Date(span.timestamp).getTime()));
                const duration = Math.max(1, end - start);
                return <article key={group.traceId ?? group.spans[0].eventId} className="overflow-hidden rounded-xl border border-white/10 bg-black/10">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
                    <div><p className="text-xs font-semibold">{group.traceId ? ("Trace " + group.traceId.slice(0, 18)) : "Standalone span"}</p><p className="mt-1 text-[10px] text-[#758091]">{group.spans.length} {group.spans.length === 1 ? "span" : "spans"} · {Math.round(duration).toLocaleString()} ms total window</p></div>
                    <span className="text-[10px] text-[#758091]">{formatTimestamp(new Date(start).toISOString())}</span>
                  </div>
                  <div className="space-y-3 p-4">
                    {group.spans.map((span) => {
                      const metadata = spanMetadata(span);
                      const spanEnd = new Date(span.timestamp).getTime();
                      const spanDuration = Math.max(0, span.value ?? 0);
                      const spanStart = spanEnd - spanDuration;
                      const left = Math.max(0, ((spanStart - start) / duration) * 100);
                      const width = Math.max(1.2, (spanDuration / duration) * 100);
                      return <div key={span.eventId} className="grid gap-2 sm:grid-cols-[190px_minmax(0,1fr)_90px] sm:items-center">
                        <div className="min-w-0"><p className="truncate text-xs font-medium">{metadata.parentSpanId ? "↳ " : ""}{span.name}</p><p className="truncate text-[10px] text-[#657181]">{metadata.spanId ? ("span " + metadata.spanId.slice(0, 12)) : span.eventId.slice(0, 14)}</p></div>
                        <div className="relative h-7 overflow-hidden rounded-md bg-white/[0.035]">
                          <span className="absolute top-1 h-5 min-w-[3px] rounded bg-[#d9f36a]/80" style={{ left: String(left) + "%", width: String(Math.min(width, 100 - left)) + "%" }} />
                        </div>
                        <p className="text-right text-[10px] tabular-nums text-[#a7b0bd]">{spanDuration.toLocaleString(undefined, { maximumFractionDigits: 2 })} ms</p>
                      </div>;
                    })}
                  </div>
                </article>;
              })}
            </div>
          ) : rows.length ? (
            <div className="divide-y divide-white/[0.06]">
              {rows.map((row, index) => <article key={`${row.eventId}-${index}`} className="grid gap-2 px-5 py-4 sm:grid-cols-[190px_110px_minmax(0,1fr)] sm:items-start">
                <time className="text-xs text-[#8791a0]">{formatTimestamp(row.timestamp)}</time>
                <span className="w-fit rounded-md border border-white/10 px-2 py-1 text-[10px] uppercase tracking-wider text-[#b4bdca]">{row.eventType}</span>
                <div className="min-w-0"><p className="truncate text-sm font-medium">{row.name}</p>{row.message && <p className="mt-1 break-words text-xs leading-5 text-[#8f98a7]">{row.message}</p>}<p className="mt-1 font-mono text-[10px] text-[#606b7a]">{row.eventId}</p></div>
              </article>)}
            </div>
          ) : tab === "events" && eventCatalogue.length ? (
            <div className="divide-y divide-white/[0.06]">
              {eventCatalogue.map((event) => {
                const maxCount = Math.max(1, ...eventCatalogue.map((item) => item.occurrences));
                const width = Math.max(2, (event.occurrences / maxCount) * 100);
                return <article key={event.name} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_190px] sm:items-center">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{event.name}</p><span className="rounded-md border border-white/10 px-2 py-1 text-[10px] tabular-nums text-[#aeb8c5]">{event.occurrences.toLocaleString()} occurrences</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><span className="block h-full rounded-full bg-[#d9f36a]/80" style={{ width: String(width) + "%" }} /></div><p className="mt-2 font-mono text-[10px] text-[#606b7a]">Latest event · {event.latestEventId}</p>
                    {(event.latestMessage || event.latestAttributes) && <details className="mt-3 rounded-lg border border-white/[0.07] bg-black/15 p-3">
                      <summary className="cursor-pointer text-xs font-medium text-[#aab4c2]">Latest event details</summary>
                      {event.latestMessage && <p className="mt-3 break-words text-xs text-[#a4adba]">{event.latestMessage}</p>}
                      {event.latestAttributes && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-5 text-[#8793a3]">{event.latestAttributes}</pre>}
                    </details>}
                  </div>
                  <div className="text-xs text-[#8791a0] sm:text-right"><span className="text-[#626e7d]">Last seen</span><p className="mt-1">{formatTimestamp(event.lastSeen)}</p></div>
                </article>;
              })}
            </div>
          ) : tab === "metrics" && metricSeries.length ? (
            <div className="grid gap-4 p-4 md:grid-cols-2">
              {metricSeries.map((series) => {
                const latest = series.points[series.points.length - 1];
                const values = series.points.map((point) => point.average);
                const min = Math.min(...values);
                const max = Math.max(...values);
                return <article key={series.name} className="min-w-0 rounded-xl border border-white/10 bg-black/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0"><h3 className="truncate text-sm font-semibold">{series.name}</h3><p className="mt-1 text-[10px] text-[#758091]">{series.points.length} time buckets · {series.points.reduce((sum, point) => sum + point.samples, 0).toLocaleString()} samples</p></div>
                    {latest && <div className="text-right"><p className="text-lg font-semibold tabular-nums">{latest.average.toLocaleString(undefined, { maximumFractionDigits: 3 })}</p><p className="text-[10px] text-[#758091]">Latest average</p></div>}
                  </div>
                  <svg viewBox="0 0 640 160" role="img" aria-label={`${series.name} average metric values over time`} className="mt-4 h-32 w-full overflow-visible">
                    <line x1="12" y1="144" x2="628" y2="144" stroke="currentColor" opacity=".15" />
                    <line x1="12" y1="80" x2="628" y2="80" stroke="currentColor" opacity=".08" />
                    <polyline points={metricLine(series.points)} fill="none" stroke="#d9f36a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="flex justify-between text-[10px] text-[#758091]"><span>Min average: {min.toLocaleString(undefined, { maximumFractionDigits: 3 })}</span><span>Max average: {max.toLocaleString(undefined, { maximumFractionDigits: 3 })}</span></div>
                  {latest && <p className="mt-2 text-[10px] text-[#606b7a]">{formatTimestamp(series.points[0].timestamp)} — {formatTimestamp(latest.timestamp)}</p>}
                </article>;
              })}
            </div>
          ) : tab === "errors" && errorGroups.length ? (
            <div className="divide-y divide-white/[0.06]">
              {errorGroups.map((group) => <article key={group.fingerprint} className="grid gap-3 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[#f5f7fb]">{group.name}</p>
                    <span className="rounded-md border border-red-400/20 bg-red-400/[0.07] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-red-300">{group.occurrences.toLocaleString()} {group.occurrences === 1 ? "occurrence" : "occurrences"}</span>
                  </div>
                  <p className="mt-2 break-words text-sm leading-6 text-[#a4adba]">{group.latestMessage || "No error message provided."}</p>
                  <p className="mt-2 font-mono text-[10px] text-[#606b7a]">Latest event · {group.latestEventId}</p>
                  {group.latestStack && <details className="mt-3 rounded-lg border border-white/[0.07] bg-black/15 p-3">
                    <summary className="cursor-pointer text-xs font-medium text-[#aab4c2]">View stack trace</summary>
                    <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-5 text-[#929eae]">{group.latestStack}</pre>
                  </details>}
                </div>
                <div className="grid gap-2 text-xs text-[#8791a0] sm:min-w-48 sm:text-right">
                  <p><span className="text-[#626e7d]">Last seen</span><br />{formatTimestamp(group.lastSeen)}</p>
                  <p><span className="text-[#626e7d]">First seen</span><br />{formatTimestamp(group.firstSeen)}</p>
                </div>
              </article>)}
            </div>
          ) : <div className="px-5 py-16 text-center"><p className="text-sm font-medium text-[#c6cdd7]">No {tab === "errors" ? "error groups" : tab === "events" ? "events" : tab} yet</p><p className="mt-2 text-xs text-[#7f8998]">When your application sends {tab}, they will appear here.</p></div>}
          {nextCursor && <div className="border-t border-white/10 px-5 py-4 text-center"><button disabled={loadingMore} onClick={() => void loadMore()} className="rounded-lg border border-white/15 px-4 py-2 text-xs font-medium text-[#cbd2dc] hover:bg-white/5 disabled:opacity-50">{loadingMore ? "Loading…" : "Load more"}</button></div>}
        </section>
        <p className="mt-5 text-xs text-[#687382]">Latest signal: {overview.lastEventAt ? formatTimestamp(overview.lastEventAt) : "No telemetry received in this range."}</p>
      </div>
    </main>
  );
}
