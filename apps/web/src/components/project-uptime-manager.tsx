"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { authClient } from "../lib/auth-client";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

type UptimeMonitor = {
  id: string;
  name: string;
  url: string;
  method: "GET" | "HEAD";
  intervalSeconds: number;
  timeoutMs: number;
  expectedStatusCode: number;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastStatus: "up" | "down" | null;
  createdAt: string;
};
type CheckResult = {
  id: string;
  status: "up" | "down";
  statusCode: number | null;
  responseTimeMs: number | null;
  errorCode: string | null;
  checkedAt: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function ProjectUptimeManager() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: session, isPending } = authClient.useSession();
  const organizationId = session?.session.activeOrganizationId ?? "";
  const [monitors, setMonitors] = useState<UptimeMonitor[]>([]);
  const [name, setName] = useState("Website availability");
  const [url, setUrl] = useState("https://example.com");
  const [method, setMethod] = useState<"GET" | "HEAD">("GET");
  const [intervalSeconds, setIntervalSeconds] = useState("60");
  const [timeoutMs, setTimeoutMs] = useState("10000");
  const [expectedStatusCode, setExpectedStatusCode] = useState("200");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<Record<string, CheckResult[]>>({});
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState<string | null>(null);

  async function request(path: string, init?: RequestInit) {
    const response = await fetch(apiBase + path, {
      ...init,
      credentials: "include",
      headers: {
        ...(init?.headers ?? {}),
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        "X-Jerico-Organization-Id": organizationId,
      },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "The request could not be completed.");
    return payload;
  }

  async function refresh() {
    if (!organizationId || !projectId) return;
    const payload = await request(`/api/v1/projects/${encodeURIComponent(projectId)}/uptime-monitors`);
    setMonitors((payload.data ?? []) as UptimeMonitor[]);
  }

  useEffect(() => {
    if (!organizationId || !projectId) return;
    void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load uptime monitors."));
  }, [organizationId, projectId]);

  async function createMonitor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`/api/v1/projects/${encodeURIComponent(projectId)}/uptime-monitors`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          method,
          intervalSeconds: Number(intervalSeconds),
          timeoutMs: Number(timeoutMs),
          expectedStatusCode: Number(expectedStatusCode),
          enabled: true,
        }),
      });
      setNotice("Monitor configuration saved. Scheduled checks are not active yet.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create monitor.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleMonitor(monitor: UptimeMonitor) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`/api/v1/projects/${encodeURIComponent(projectId)}/uptime-monitors/${encodeURIComponent(monitor.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !monitor.enabled }),
      });
      setNotice(monitor.enabled ? "Monitor paused." : "Monitor enabled for the upcoming probe scheduler.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update monitor.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteMonitor(monitor: UptimeMonitor) {
    if (!window.confirm(`Delete the monitor "${monitor.name}" and its stored check history?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`/api/v1/projects/${encodeURIComponent(projectId)}/uptime-monitors/${encodeURIComponent(monitor.id)}`, { method: "DELETE" });
      setHistory((current) => { const next = { ...current }; delete next[monitor.id]; return next; });
      setNotice("Monitor deleted.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete monitor.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleHistory(monitor: UptimeMonitor) {
    if (expandedHistory === monitor.id) { setExpandedHistory(null); return; }
    setExpandedHistory(monitor.id);
    if (history[monitor.id]) return;
    setLoadingHistory(monitor.id);
    try {
      const payload = await request(`/api/v1/projects/${encodeURIComponent(projectId)}/uptime-monitors/${encodeURIComponent(monitor.id)}/checks?limit=50`);
      setHistory((current) => ({ ...current, [monitor.id]: (payload.data ?? []) as CheckResult[] }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load monitor history.");
      setExpandedHistory(null);
    } finally {
      setLoadingHistory(null);
    }
  }

  if (isPending) return <main className="min-h-screen bg-[#090b10] p-8 text-sm text-[#929aaa]">Loading uptime monitors…</main>;
  if (!session) return <main className="min-h-screen bg-[#090b10] p-8 text-[#f5f7fb]"><Link href="/sign-in">Sign in to manage uptime monitors</Link></main>;

  return (
    <main className="min-h-screen bg-[#090b10] px-5 py-8 text-[#f5f7fb] sm:px-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/dashboard" className="text-sm text-[#a8afbd] hover:text-white">← Back to workspace</Link>
        <header className="mt-8 border-b border-white/10 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d9f36a]">Project monitoring</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Uptime monitors</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#929aaa]">Configure the endpoints you want Jerico to monitor. Checks, scheduling, and incident transitions are the next implementation slice.</p>
        </header>

        <div role="status" className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/[0.04] px-4 py-3 text-sm text-amber-100">
          <p className="font-semibold">Configuration mode</p>
          <p className="mt-1 text-xs leading-5 text-amber-100/70">Monitor definitions and history storage are ready, but scheduled probes are not running yet. No endpoint is currently being checked and no uptime status is inferred.</p>
        </div>
        {error && <p role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</p>}
        {notice && <p role="status" className="mt-5 rounded-xl border border-[#d9f36a]/20 bg-[#d9f36a]/5 px-4 py-3 text-sm text-[#d9f36a]">{notice}</p>}

        <section className="mt-7 rounded-2xl border border-white/10 bg-white/[0.035] p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#d9f36a]">New monitor</p>
          <h2 className="mt-2 text-xl font-semibold">Add an endpoint</h2>
          <form onSubmit={createMonitor} className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm md:col-span-2"><span className="text-[#a8afbd]">Monitor name</span><input required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3 outline-none focus:border-[#d9f36a]/60" /></label>
            <label className="space-y-2 text-sm md:col-span-2"><span className="text-[#a8afbd]">Public HTTP(S) URL</span><input required type="url" maxLength={2048} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://status.example.com/health" className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3 outline-none focus:border-[#d9f36a]/60" /></label>
            <label className="space-y-2 text-sm"><span className="text-[#a8afbd]">Method</span><select value={method} onChange={(event) => setMethod(event.target.value as "GET" | "HEAD")} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3"><option value="GET">GET</option><option value="HEAD">HEAD</option></select></label>
            <label className="space-y-2 text-sm"><span className="text-[#a8afbd]">Expected status code</span><input type="number" min={100} max={599} value={expectedStatusCode} onChange={(event) => setExpectedStatusCode(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3" /></label>
            <label className="space-y-2 text-sm"><span className="text-[#a8afbd]">Check interval (seconds)</span><input type="number" min={60} max={86400} value={intervalSeconds} onChange={(event) => setIntervalSeconds(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3" /></label>
            <label className="space-y-2 text-sm"><span className="text-[#a8afbd]">Timeout (milliseconds)</span><input type="number" min={1000} max={30000} value={timeoutMs} onChange={(event) => setTimeoutMs(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3" /></label>
            <div className="md:col-span-2"><button disabled={busy} className="rounded-xl bg-[#d9f36a] px-5 py-3 text-sm font-semibold text-[#15190b] disabled:opacity-50">{busy ? "Saving…" : "Save monitor"}</button></div>
          </form>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Configured monitors</h2><p className="mt-1 text-xs text-[#758091]">Project-scoped monitor definitions</p></div><span className="text-xs text-[#929aaa]">{monitors.length} total</span></div>
          {monitors.length ? <div className="mt-4 space-y-3">{monitors.map((monitor) => <article key={monitor.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{monitor.name}</h3><span className="rounded-full border border-white/10 px-2 py-1 text-[9px] uppercase tracking-wider text-[#a8afbd]">{monitor.enabled ? "Enabled" : "Paused"}</span><span className="rounded-full border border-amber-300/20 px-2 py-1 text-[9px] uppercase tracking-wider text-amber-100">Not checked yet</span></div><p className="mt-2 break-all font-mono text-xs text-[#929aaa]">{monitor.method} · {monitor.url}</p><p className="mt-2 text-[10px] text-[#667181]">Every {monitor.intervalSeconds}s · {monitor.timeoutMs}ms timeout · expected HTTP {monitor.expectedStatusCode}</p></div>
              <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void toggleHistory(monitor)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-[#a8afbd] hover:bg-white/5 disabled:opacity-50">History</button><button type="button" disabled={busy} onClick={() => void toggleMonitor(monitor)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-[#a8afbd] hover:bg-white/5 disabled:opacity-50">{monitor.enabled ? "Pause" : "Enable"}</button><button type="button" disabled={busy} onClick={() => void deleteMonitor(monitor)} className="rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-300 hover:bg-red-400/5 disabled:opacity-50">Delete</button></div>
            </div>
            {expandedHistory === monitor.id && <div className="mt-4 border-t border-white/[0.07] pt-4"><h4 className="text-xs font-semibold text-[#a8afbd]">Recent checks</h4>{loadingHistory === monitor.id ? <p className="mt-3 text-xs text-[#758091]">Loading history…</p> : history[monitor.id]?.length ? <div className="mt-3 divide-y divide-white/[0.06]">{history[monitor.id].map((check) => <div key={check.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs"><span>{formatDate(check.checkedAt)}</span><span className="text-[#929aaa]">{check.statusCode ?? check.errorCode ?? "No status"}</span><span className={check.status === "up" ? "text-[#d9f36a]" : "text-red-300"}>{check.status}</span><span className="tabular-nums text-[#929aaa]">{check.responseTimeMs === null ? "—" : `${check.responseTimeMs} ms`}</span></div>)}</div> : <p className="mt-3 text-xs text-[#758091]">No check results yet. History will appear after the probe scheduler is enabled.</p>}</div>}
          </article>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-white/15 px-5 py-12 text-center"><p className="text-sm font-medium">No monitors configured</p><p className="mt-2 text-xs text-[#758091]">Add an endpoint above to define your first uptime monitor.</p></div>}
        </section>
      </div>
    </main>
  );
}
