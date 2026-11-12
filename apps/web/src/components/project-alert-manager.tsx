"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "../lib/auth-client";
import { NotificationChannelManager } from "./notification-channel-manager";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
type Metric = "error_count" | "uptime_down" | "response_time";
type AlertRule = {
  id: string; name: string; metric: Metric; comparison: "gt" | "gte"; threshold: number;
  windowSeconds: number; consecutiveBreaches: number; escalationDelayMinutes: number; enabled: boolean; silencedUntil: string | null; consecutiveCount: number;
};
type Incident = {
  id: string; alertRuleId: string; title: string; assignedTo: string | null; status: "open" | "acknowledged" | "resolved";
  triggerValue: number; startedAt: string; lastTriggeredAt: string; resolvedAt: string | null; escalatedAt: string | null; escalationCount: number;
};
type TeamMember = { userId: string; name: string; email: string; role: string };
type IncidentActivity = { id: string; activityType: "opened" | "acknowledged" | "resolved" | "reopened" | "escalated" | "note"; body: string | null; actorId: string | null; actorName: string | null; actorEmail: string | null; createdAt: string };
type NotificationDelivery = {
  id: string; incidentId: string; channelId: string; target: string; eventType: string;
  status: "queued" | "sent" | "failed"; attempts: number; enqueueAttempts: number;
  providerMessageId: string | null; lastErrorCode: string | null; lastAttemptAt: string | null;
  sentAt: string | null; createdAt: string;
};
const metricLabels: Record<Metric, string> = {
  error_count: "Error count",
  uptime_down: "Failed uptime checks",
  response_time: "Response time (p95)",
};
function when(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function ProjectAlertManager() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: session, isPending } = authClient.useSession();
  const organizationId = session?.session.activeOrganizationId ?? "";
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [deliveries, setDeliveries] = useState<NotificationDelivery[]>([]);
  const [activity, setActivity] = useState<Record<string, IncidentActivity[]>>({});
  const [expandedIncidentId, setExpandedIncidentId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [name, setName] = useState("High error volume");
  const [metric, setMetric] = useState<Metric>("error_count");
  const [threshold, setThreshold] = useState("10");
  const [comparison, setComparison] = useState<"gt" | "gte">("gte");
  const [windowSeconds, setWindowSeconds] = useState("300");
  const [consecutiveBreaches, setConsecutiveBreaches] = useState("1");
  const [escalationDelayMinutes, setEscalationDelayMinutes] = useState("0");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
    const [rulePayload, incidentPayload, deliveryPayload, memberPayload] = await Promise.all([
      request(`/api/v1/projects/${encodeURIComponent(projectId)}/alert-rules`),
      request(`/api/v1/projects/${encodeURIComponent(projectId)}/incidents?limit=50`),
      request(`/api/v1/projects/${encodeURIComponent(projectId)}/notification-deliveries?limit=50`),
      request(`/api/v1/projects/${encodeURIComponent(projectId)}/members`),
    ]);
    setRules((rulePayload.data ?? []) as AlertRule[]);
    setIncidents((incidentPayload.data ?? []) as Incident[]);
    setDeliveries((deliveryPayload.data ?? []) as NotificationDelivery[]);
    setTeamMembers((memberPayload.data ?? []) as TeamMember[]);
  }
  useEffect(() => {
    if (!organizationId || !projectId) return;
    void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load alerts."));
  }, [organizationId, projectId]);

  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      await request(
        editingRuleId
          ? `/api/v1/projects/${encodeURIComponent(projectId)}/alert-rules/${encodeURIComponent(editingRuleId)}`
          : `/api/v1/projects/${encodeURIComponent(projectId)}/alert-rules`,
        {
          method: editingRuleId ? "PATCH" : "POST",
          body: JSON.stringify({
            name: name.trim(), metric, comparison, threshold: Number(threshold),
            windowSeconds: Number(windowSeconds), consecutiveBreaches: Number(consecutiveBreaches), escalationDelayMinutes: Number(escalationDelayMinutes),
            ...(editingRuleId ? {} : { enabled: true }),
          }),
        },
      );
      setNotice(editingRuleId ? "Alert rule updated. The next evaluation will use the new settings." : "Alert rule created. It will be evaluated by the next scheduled cycle.");
      setEditingRuleId(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create alert rule.");
    } finally { setBusy(false); }
  }
  function beginEditRule(rule: AlertRule) {
    setEditingRuleId(rule.id); setName(rule.name); setMetric(rule.metric); setComparison(rule.comparison);
    setThreshold(String(rule.threshold)); setWindowSeconds(String(rule.windowSeconds));
    setConsecutiveBreaches(String(rule.consecutiveBreaches)); setEscalationDelayMinutes(String(rule.escalationDelayMinutes)); setError(""); setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function cancelEditRule() {
    setEditingRuleId(null); setName("High error volume"); setMetric("error_count"); setComparison("gte");
    setThreshold("10"); setWindowSeconds("300"); setConsecutiveBreaches("1"); setEscalationDelayMinutes("0");
  }
  async function toggleRule(rule: AlertRule) {
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/v1/projects/${encodeURIComponent(projectId)}/alert-rules/${encodeURIComponent(rule.id)}`, {
        method: "PATCH", body: JSON.stringify({ enabled: !rule.enabled }),
      });
      setNotice(rule.enabled ? "Alert rule paused." : "Alert rule enabled.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update alert rule.");
    } finally { setBusy(false); }
  }
  async function silenceRule(rule: AlertRule, durationSeconds: number) {
    setBusy(true); setError(""); setNotice("");
    try { await request(`/api/v1/projects/${encodeURIComponent(projectId)}/alert-rules/${encodeURIComponent(rule.id)}/silence`, { method: "POST", body: JSON.stringify({ durationSeconds }) }); setNotice(`Alert rule snoozed for ${durationSeconds / 3600} hour${durationSeconds === 3600 ? "" : "s"}.`); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not snooze alert rule."); } finally { setBusy(false); }
  }
  async function unsilenceRule(rule: AlertRule) {
    setBusy(true); setError(""); setNotice("");
    try { await request(`/api/v1/projects/${encodeURIComponent(projectId)}/alert-rules/${encodeURIComponent(rule.id)}/unsilence`, { method: "POST" }); setNotice("Alert rule resumed."); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not resume alert rule."); } finally { setBusy(false); }
  }
  async function deleteRule(rule: AlertRule) {
    if (!window.confirm(`Delete alert rule "${rule.name}" and its incident history?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/v1/projects/${encodeURIComponent(projectId)}/alert-rules/${encodeURIComponent(rule.id)}`, { method: "DELETE" });
      setNotice("Alert rule deleted.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete alert rule.");
    } finally { setBusy(false); }
  }
  async function updateIncident(incident: Incident, action: "acknowledge" | "resolve" | "reopen") {
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/v1/projects/${encodeURIComponent(projectId)}/incidents/${encodeURIComponent(incident.id)}/${action}`, { method: "POST" });
      setNotice(action === "acknowledge" ? "Incident acknowledged." : action === "resolve" ? "Incident resolved." : "Incident reopened.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update incident.");
    } finally { setBusy(false); }
  }


  async function assignIncident(incident: Incident, assignedTo: string | null) {
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/v1/projects/${encodeURIComponent(projectId)}/incidents/${encodeURIComponent(incident.id)}/assignee`, { method: "PATCH", body: JSON.stringify({ assignedTo }) });
      setNotice(assignedTo ? "Incident assignment updated." : "Incident unassigned."); await refresh();
      if (activity[incident.id]) { const payload = await request(`/api/v1/projects/${encodeURIComponent(projectId)}/incidents/${encodeURIComponent(incident.id)}/activity`); setActivity((current) => ({ ...current, [incident.id]: (payload.data ?? []) as IncidentActivity[] })); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not assign incident."); } finally { setBusy(false); }
  }
  async function toggleIncidentActivity(incidentId: string) {
    if (expandedIncidentId === incidentId) { setExpandedIncidentId(null); return; }
    setExpandedIncidentId(incidentId); if (activity[incidentId]) return;
    try { const payload = await request(`/api/v1/projects/${encodeURIComponent(projectId)}/incidents/${encodeURIComponent(incidentId)}/activity`); setActivity((current) => ({ ...current, [incidentId]: (payload.data ?? []) as IncidentActivity[] })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load incident activity."); setExpandedIncidentId(null); }
  }
  async function addIncidentNote(incidentId: string) {
    const body = (noteDrafts[incidentId] ?? "").trim(); if (!body) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/v1/projects/${encodeURIComponent(projectId)}/incidents/${encodeURIComponent(incidentId)}/notes`, { method: "POST", body: JSON.stringify({ body }) });
      setNoteDrafts((current) => ({ ...current, [incidentId]: "" }));
      const payload = await request(`/api/v1/projects/${encodeURIComponent(projectId)}/incidents/${encodeURIComponent(incidentId)}/activity`);
      setActivity((current) => ({ ...current, [incidentId]: (payload.data ?? []) as IncidentActivity[] })); setNotice("Incident note added.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add incident note."); } finally { setBusy(false); }
  }
  async function retryDelivery(delivery: NotificationDelivery) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request(`/api/v1/projects/${encodeURIComponent(projectId)}/notification-deliveries/${encodeURIComponent(delivery.id)}/retry`, { method: "POST" });
      setNotice(result?.status === "scheduled" ? "Notification retry scheduled for after quiet hours." : "Notification retry queued. Delivery history will update when the worker processes it.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not retry notification delivery.");
    } finally { setBusy(false); }
  }

  if (isPending) return <main className="min-h-screen bg-[#090b10] p-8 text-sm text-[#929aaa]">Loading alert rules…</main>;
  if (!session) return <main className="min-h-screen bg-[#090b10] p-8 text-[#f5f7fb]"><Link href="/sign-in">Sign in to continue</Link></main>;

  return (
    <main className="min-h-screen bg-[#090b10] px-5 py-8 text-[#f5f7fb] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div><Link href="/dashboard" className="text-sm text-[#a8afbd] hover:text-white">← Dashboard</Link><h1 className="mt-3 text-3xl font-semibold tracking-tight">Alerts & incidents</h1><p className="mt-2 text-sm text-[#929aaa]">Define project thresholds and track incidents when conditions persist.</p></div>
          <Link href={`/dashboard/projects/${projectId}/uptime`} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-[#c2c8d3] hover:bg-white/5">Uptime monitors</Link>
        </header>
        {error && <p role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</p>}
        {notice && <p role="status" className="mt-5 rounded-xl border border-[#d9f36a]/20 bg-[#d9f36a]/5 px-4 py-3 text-sm text-[#d9f36a]">{notice}</p>}
        <section className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <form onSubmit={createRule} className="h-fit rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d9f36a]">{editingRuleId ? "Edit rule" : "New rule"}</p>
            <h2 className="mt-2 text-xl font-semibold">{editingRuleId ? "Update alert" : "Create an alert"}</h2>
            <label className="mt-5 block space-y-2 text-sm"><span className="text-[#a8afbd]">Rule name</span><input required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3 outline-none focus:border-[#d9f36a]/60" /></label>
            <label className="mt-4 block space-y-2 text-sm"><span className="text-[#a8afbd]">Signal</span><select value={metric} onChange={(event) => setMetric(event.target.value as Metric)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3">{Object.entries(metricLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <div className="mt-4 grid grid-cols-[0.8fr_1.2fr] gap-3">
              <label className="space-y-2 text-sm"><span className="text-[#a8afbd]">Condition</span><select value={comparison} onChange={(event) => setComparison(event.target.value as "gt" | "gte")} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-3 py-3"><option value="gte">At least</option><option value="gt">Greater than</option></select></label>
              <label className="space-y-2 text-sm"><span className="text-[#a8afbd]">{metric === "response_time" ? "Milliseconds" : "Count"}</span><input type="number" min="1" max="1000000" required value={threshold} onChange={(event) => setThreshold(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3" /></label>
            </div>
            <label className="mt-4 block space-y-2 text-sm"><span className="text-[#a8afbd]">Evaluation window</span><select value={windowSeconds} onChange={(event) => setWindowSeconds(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3"><option value="300">5 minutes</option><option value="900">15 minutes</option><option value="3600">1 hour</option><option value="86400">24 hours</option></select></label>
            <label className="mt-4 block space-y-2 text-sm"><span className="text-[#a8afbd]">Consecutive breaches</span><select value={consecutiveBreaches} onChange={(event) => setConsecutiveBreaches(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3">{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value} evaluation{value === 1 ? "" : "s"}</option>)}</select></label>
                        <label className="mt-4 block space-y-2 text-sm"><span className="text-[#a8afbd]">Escalate if unacknowledged</span><select value={escalationDelayMinutes} onChange={(event) => setEscalationDelayMinutes(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3"><option value="0">No escalation</option><option value="5">After 5 minutes</option><option value="15">After 15 minutes</option><option value="30">After 30 minutes</option><option value="60">After 1 hour</option></select></label>
<p className="mt-3 text-xs leading-5 text-[#737b89]">{metric === "error_count" ? "Counts error events in the selected window." : metric === "uptime_down" ? "Counts failed uptime checks in the selected window. No probe data means no evaluation." : "Uses the 95th percentile of recorded uptime response times in the selected window."} Rules are evaluated every minute.</p>
            <div className="mt-5 flex gap-2"><button disabled={busy} className="flex-1 rounded-xl bg-[#d9f36a] px-4 py-3 text-sm font-semibold text-[#15190b] disabled:opacity-50">{busy ? "Saving…" : editingRuleId ? "Save changes" : "Create alert rule"}</button>{editingRuleId && <button type="button" disabled={busy} onClick={cancelEditRule} className="rounded-xl border border-white/15 px-4 py-3 text-sm text-[#c2c8d3] disabled:opacity-50">Cancel</button>}</div>
          </form>
          <div className="space-y-6">
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
              <div className="flex items-center justify-between"><div><h2 className="font-semibold">Alert rules</h2><p className="mt-1 text-xs text-[#737b89]">Rules configured for this project</p></div><span className="text-xs text-[#929aaa]">{rules.length} total</span></div>
              <div className="mt-4 divide-y divide-white/10">
                {rules.map((rule) => <div key={rule.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-sm font-medium">{rule.name}</p><span className={`rounded-full px-2 py-1 text-[10px] ${rule.enabled && rule.silencedUntil && new Date(rule.silencedUntil).getTime() > Date.now() ? "bg-amber-300/10 text-amber-100" : rule.enabled ? "bg-[#d9f36a]/10 text-[#d9f36a]" : "bg-white/10 text-[#929aaa]"}`}>{!rule.enabled ? "Paused" : rule.silencedUntil && new Date(rule.silencedUntil).getTime() > Date.now() ? "Snoozed" : "Enabled"}</span></div><p className="mt-2 text-xs text-[#929aaa]">{metricLabels[rule.metric]} · {rule.comparison === "gte" ? "≥" : ">"} {rule.threshold}{rule.metric === "response_time" ? " ms" : ""} · {Math.round(rule.windowSeconds / 60)}m window · {rule.consecutiveBreaches} consecutive</p>{rule.escalationDelayMinutes > 0 && <p className="mt-1 text-xs text-amber-100">Escalates if still unacknowledged after {rule.escalationDelayMinutes} minutes</p>}{rule.silencedUntil && new Date(rule.silencedUntil).getTime() > Date.now() && <p className="mt-2 text-xs text-amber-200">Snoozed until {when(rule.silencedUntil)}</p>}</div><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => beginEditRule(rule)} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-[#c2c8d3] disabled:opacity-50">Edit</button><div className="flex flex-wrap gap-1"><button disabled={busy || !rule.enabled || Boolean(rule.silencedUntil && new Date(rule.silencedUntil).getTime() > Date.now())} onClick={() => void silenceRule(rule, 3600)} className="rounded-lg border border-amber-300/20 px-2 py-2 text-xs text-amber-100 disabled:opacity-40">1h</button><button disabled={busy || !rule.enabled || Boolean(rule.silencedUntil && new Date(rule.silencedUntil).getTime() > Date.now())} onClick={() => void silenceRule(rule, 14400)} className="rounded-lg border border-amber-300/20 px-2 py-2 text-xs text-amber-100 disabled:opacity-40">4h</button><button disabled={busy || !rule.enabled || Boolean(rule.silencedUntil && new Date(rule.silencedUntil).getTime() > Date.now())} onClick={() => void silenceRule(rule, 86400)} className="rounded-lg border border-amber-300/20 px-2 py-2 text-xs text-amber-100 disabled:opacity-40">24h</button><button disabled={busy || !rule.enabled || Boolean(rule.silencedUntil && new Date(rule.silencedUntil).getTime() > Date.now())} onClick={() => void silenceRule(rule, 604800)} className="rounded-lg border border-amber-300/20 px-2 py-2 text-xs text-amber-100 disabled:opacity-40">7d</button></div>{rule.silencedUntil && new Date(rule.silencedUntil).getTime() > Date.now() && <button disabled={busy} onClick={() => void unsilenceRule(rule)} className="rounded-lg border border-[#d9f36a]/20 px-3 py-2 text-xs text-[#d9f36a]">Resume</button>}<button disabled={busy} onClick={() => void toggleRule(rule)} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-[#c2c8d3] disabled:opacity-50">{rule.enabled ? "Pause" : "Enable"}</button><button disabled={busy} onClick={() => void deleteRule(rule)} className="rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-300 disabled:opacity-50">Delete</button></div></div>
                </div>)}
                {!rules.length && <p className="py-8 text-center text-sm text-[#737b89]">No alert rules yet. Create one to start monitoring a signal.</p>}
              </div>
            </section>
            <NotificationChannelManager projectId={projectId} organizationId={organizationId} />
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
              <div className="flex items-center justify-between"><div><h2 className="font-semibold">Notification delivery history</h2><p className="mt-1 text-xs text-[#737b89]">Recent email and webhook attempts for this project</p></div><span className="text-xs text-[#929aaa]">{deliveries.length} recent</span></div>
              <div className="mt-4 divide-y divide-white/10">
                {deliveries.map((delivery) => <div key={delivery.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{delivery.eventType.replaceAll(".", " ")}</p><span className={`rounded-full px-2 py-1 text-[10px] ${delivery.status === "sent" ? "bg-[#d9f36a]/10 text-[#d9f36a]" : delivery.status === "failed" ? "bg-red-400/10 text-red-300" : "bg-blue-400/10 text-blue-300"}`}>{delivery.status}</span></div><p className="mt-1 truncate text-xs text-[#929aaa]">{delivery.target}</p><p className="mt-1 text-xs text-[#737b89]">{when(delivery.createdAt)} · {delivery.attempts} provider attempts{delivery.lastErrorCode ? ` · ${delivery.lastErrorCode}` : ""}</p></div>
                  {delivery.status === "failed" && <button disabled={busy} onClick={() => void retryDelivery(delivery)} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-[#c2c8d3] disabled:opacity-50">Retry delivery</button>}
                </div>)}
                {!deliveries.length && <p className="py-8 text-center text-sm text-[#737b89]">No notification deliveries yet. Verify an email or webhook channel to receive incident updates.</p>}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
              <div className="flex items-center justify-between"><div><h2 className="font-semibold">Incidents</h2><p className="mt-1 text-xs text-[#737b89]">Active and recent incident history</p></div><span className="text-xs text-[#929aaa]">{incidents.filter((item) => item.status !== "resolved").length} active</span></div>
              <div className="mt-4 divide-y divide-white/10">
                {incidents.map((incident) => <div key={incident.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-sm font-medium">{incident.title}</p><span className={`rounded-full px-2 py-1 text-[10px] ${incident.status === "resolved" ? "bg-white/10 text-[#929aaa]" : incident.status === "acknowledged" ? "bg-blue-400/10 text-blue-300" : "bg-red-400/10 text-red-300"}`}>{incident.status}</span></div><p className="mt-2 text-xs text-[#929aaa]">Triggered value: {incident.triggerValue} · Started {when(incident.startedAt)}{incident.escalatedAt ? ` · Escalated ${incident.escalationCount} time` : ""}</p><label className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#929aaa]">Assigned to <select disabled={busy || incident.status === "resolved"} value={incident.assignedTo ?? ""} onChange={(event) => void assignIncident(incident, event.target.value || null)} className="rounded-lg border border-white/10 bg-[#0c1018] px-2 py-1.5 text-xs text-[#e3e7ef]"><option value="">Unassigned</option>{teamMembers.map((person) => <option key={person.userId} value={person.userId}>{person.name} · {person.email}</option>)}</select></label>{incident.resolvedAt && <p className="mt-1 text-xs text-[#737b89]">Resolved {when(incident.resolvedAt)}</p>}</div><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => void toggleIncidentActivity(incident.id)} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-[#c2c8d3]">{expandedIncidentId === incident.id ? "Hide activity" : "Activity"}</button>{incident.status === "open" && <button disabled={busy} onClick={() => void updateIncident(incident, "acknowledge")} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-[#c2c8d3] disabled:opacity-50">Acknowledge</button>}{incident.status !== "resolved" && <button disabled={busy} onClick={() => void updateIncident(incident, "resolve")} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-[#c2c8d3] disabled:opacity-50">Resolve</button>}{incident.status === "resolved" && <button disabled={busy} onClick={() => void updateIncident(incident, "reopen")} className="rounded-lg border border-[#d9f36a]/20 px-3 py-2 text-xs text-[#d9f36a] disabled:opacity-50">Reopen</button>}</div></div>
                  {expandedIncidentId === incident.id && <div className="mt-4 border-t border-white/[0.07] pt-4">
                    <h4 className="text-xs font-semibold text-[#a8afbd]">Incident activity</h4>
                    <div className="mt-3 space-y-3">{(activity[incident.id] ?? []).map((item) => <div key={item.id} className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium capitalize">{item.activityType.replaceAll("_", " ")}</p><span className="text-[10px] text-[#737b89]">{when(item.createdAt)}</span></div>
                      {item.body && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[#c2c8d3]">{item.body}</p>}
                      <p className="mt-1 text-[10px] text-[#737b89]">{item.actorName ?? (item.actorId ? item.actorId : "Jerico automation")}{item.actorEmail ? ` · ${item.actorEmail}` : ""}</p>
                    </div>)}{!activity[incident.id]?.length && <p className="text-xs text-[#737b89]">No activity recorded yet.</p>}</div>
                    {incident.status !== "resolved" && <form onSubmit={(event) => { event.preventDefault(); void addIncidentNote(incident.id); }} className="mt-4 space-y-2">
                      <textarea maxLength={2000} rows={3} value={noteDrafts[incident.id] ?? ""} onChange={(event) => setNoteDrafts((current) => ({ ...current, [incident.id]: event.target.value }))} placeholder="Add an operational note for your team…" className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-3 py-3 text-xs text-white outline-none focus:border-[#d9f36a]/50" />
                      <div className="flex justify-end"><button disabled={busy || !(noteDrafts[incident.id] ?? "").trim()} className="rounded-lg bg-[#d9f36a] px-3 py-2 text-xs font-semibold text-[#15190b] disabled:opacity-50">Add note</button></div>
                    </form>}
                  </div>}
                </div>)}
                {!incidents.length && <p className="py-8 text-center text-sm text-[#737b89]">No incidents recorded. Incidents will appear when an alert rule breaches its threshold.</p>}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
