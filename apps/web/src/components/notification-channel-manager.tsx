"use client";

import { useEffect, useState, type FormEvent } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
type Channel = { id: string; type: "email" | "webhook"; target: string; verifiedAt: string | null; enabled: boolean; notifyOnOpened: boolean; notifyOnAcknowledged: boolean; notifyOnResolved: boolean; notifyOnReopened: boolean; notifyOnEscalated: boolean; quietHoursEnabled: boolean; quietHoursStart: string; quietHoursEnd: string; timezone: string; lastVerificationErrorCode: string | null; createdAt: string };
type Delivery = { id: string; incidentId: string; target: string; eventType: string; status: "queued" | "sent" | "failed"; attempts: number; lastErrorCode: string | null; lastAttemptAt: string | null; sentAt: string | null; createdAt: string };
function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function NotificationChannelManager({ projectId, organizationId }: { projectId: string; organizationId: string }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [canManageChannels, setCanManageChannels] = useState(false);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [email, setEmail] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [signingSecret, setSigningSecret] = useState("");
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
    const results = await Promise.allSettled([
      request("/api/v1/notification-channels"),
      request(`/api/v1/projects/${encodeURIComponent(projectId)}/notification-deliveries?limit=25`),
    ]);
    if (results[0].status === "fulfilled") { setChannels((results[0].value.data ?? []) as Channel[]); setCanManageChannels(true); }
    else setCanManageChannels(false);
    if (results[1].status === "fulfilled") setDeliveries((results[1].value.data ?? []) as Delivery[]);
    if (results[0].status === "rejected" && results[1].status === "rejected") throw results[0].reason;
    if (results[0].status === "rejected") setError(results[0].reason instanceof Error ? results[0].reason.message : "You may not have permission to manage notification channels.");
  }
  useEffect(() => {
    if (!organizationId || !projectId) return;
    void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load notification settings."));
  }, [organizationId, projectId]);

  async function addEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await request("/api/v1/notification-channels", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      setEmail(""); setNotice("Verification email sent. Confirm the address before it receives incident notifications.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add notification email.");
    } finally { setBusy(false); }
  }
  async function addWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); setSigningSecret("");
    try {
      const payload = await request("/api/v1/notification-channels/webhook", {
        method: "POST", body: JSON.stringify({ url: webhookUrl.trim() }),
      });
      setWebhookUrl("");
      setSigningSecret(payload.data.signingSecret as string);
      setNotice("Webhook created. Copy its signing secret now; it cannot be retrieved again.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add webhook endpoint.");
    } finally { setBusy(false); }
  }
  async function resend(channel: Channel) {
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/v1/notification-channels/${encodeURIComponent(channel.id)}/resend-verification`, { method: "POST" });
      setNotice(channel.type === "webhook" ? "A new verification challenge has been queued." : "A new verification email has been sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resend verification email.");
    } finally { setBusy(false); }
  }
  async function updateChannel(channel: Channel, settings: Partial<Pick<Channel, "enabled" | "notifyOnOpened" | "notifyOnAcknowledged" | "notifyOnResolved" | "notifyOnReopened" | "notifyOnEscalated" | "quietHoursEnabled" | "quietHoursStart" | "quietHoursEnd" | "timezone">>) {
    setBusy(true); setError(""); setNotice("");
    try { await request(`/api/v1/notification-channels/${encodeURIComponent(channel.id)}`, { method: "PATCH", body: JSON.stringify(settings) }); setNotice(settings.enabled !== undefined ? settings.enabled ? "Notification channel enabled." : "Notification channel paused." : "Notification preferences saved."); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update notification channel."); } finally { setBusy(false); }
  }
  async function toggleChannel(channel: Channel) { return updateChannel(channel, { enabled: !channel.enabled }); }

  async function remove(channel: Channel) {
    if (!window.confirm(`Remove ${channel.target} from incident notifications?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/v1/notification-channels/${encodeURIComponent(channel.id)}`, { method: "DELETE" });
      setNotice("Notification channel removed."); await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove notification email.");
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
      <div><h2 className="font-semibold">Notification delivery</h2><p className="mt-1 text-xs text-[#737b89]">Verified email and webhook channels receive incident opened, acknowledged, and resolved updates.</p></div>
      {error && <p role="alert" className="mt-4 text-xs text-red-300">{error}</p>}
      {notice && <p role="status" className="mt-4 text-xs text-[#d9f36a]">{notice}</p>}
      {canManageChannels ? <>
        <form onSubmit={addEmail} className="mt-5 flex flex-wrap gap-2">
          <input type="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ops@yourcompany.com" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3 text-sm outline-none focus:border-[#d9f36a]/60" />
          <button disabled={busy || !organizationId} className="rounded-xl bg-[#d9f36a] px-4 py-3 text-sm font-semibold text-[#15190b] disabled:opacity-50">{busy ? "Working…" : "Add email"}</button>
        </form>
        <form onSubmit={addWebhook} className="mt-3 flex flex-wrap gap-2">
          <input type="url" required maxLength={2048} value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder="https://your-service.com/jerico/webhook" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3 text-sm outline-none focus:border-[#d9f36a]/60" />
          <button disabled={busy || !organizationId} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-[#e3e7ef] disabled:opacity-50">{busy ? "Working…" : "Add webhook"}</button>
        </form>
        <p className="mt-2 text-[11px] leading-5 text-[#737b89]">Webhook endpoints must use public HTTPS on port 443. To verify, accept a POST challenge and return the same challenge in a JSON response.</p>
        {signingSecret && <div className="mt-4 rounded-xl border border-[#d9f36a]/20 bg-[#d9f36a]/5 p-4">
          <p className="text-xs font-semibold text-[#d9f36a]">Copy your webhook signing secret now</p>
          <code className="mt-2 block break-all text-xs text-[#e3e7ef]">{signingSecret}</code>
          <button type="button" onClick={() => void navigator.clipboard.writeText(signingSecret)} className="mt-3 rounded-lg border border-white/15 px-3 py-2 text-xs text-[#c2c8d3]">Copy secret</button>
          <p className="mt-2 text-[11px] text-[#929aaa]">Jerico stores this encrypted and will not display it again.</p>
        </div>}
        <div className="mt-4 divide-y divide-white/10">
          {channels.map((channel) => <div key={channel.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0 flex-1"><p className="text-sm">{channel.type === "webhook" ? "Webhook" : "Email"} · {channel.target}</p><p className="mt-1 text-xs text-[#737b89]">{channel.verifiedAt ? "Verified" : "Verification pending"}{channel.verifiedAt ? channel.enabled ? " · Active" : " · Paused" : ""}{channel.lastVerificationErrorCode ? " · " + channel.lastVerificationErrorCode : ""}</p>
              {channel.verifiedAt && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                <label className="flex items-center gap-2 text-[11px] text-[#929aaa]"><input type="checkbox" disabled={busy} checked={channel.notifyOnOpened} onChange={() => void updateChannel(channel, { notifyOnOpened: !channel.notifyOnOpened })} />Opened</label>
                <label className="flex items-center gap-2 text-[11px] text-[#929aaa]"><input type="checkbox" disabled={busy} checked={channel.notifyOnAcknowledged} onChange={() => void updateChannel(channel, { notifyOnAcknowledged: !channel.notifyOnAcknowledged })} />Acknowledged</label>
                <label className="flex items-center gap-2 text-[11px] text-[#929aaa]"><input type="checkbox" disabled={busy} checked={channel.notifyOnResolved} onChange={() => void updateChannel(channel, { notifyOnResolved: !channel.notifyOnResolved })} />Resolved</label>
                <label className="flex items-center gap-2 text-[11px] text-[#929aaa]"><input type="checkbox" disabled={busy} checked={channel.notifyOnReopened} onChange={() => void updateChannel(channel, { notifyOnReopened: !channel.notifyOnReopened })} />Reopened</label>
                <label className="flex items-center gap-2 text-[11px] text-[#929aaa]"><input type="checkbox" disabled={busy} checked={channel.notifyOnEscalated} onChange={() => void updateChannel(channel, { notifyOnEscalated: !channel.notifyOnEscalated })} />Escalated</label>
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-3">
                  <label className="flex items-center gap-2 text-[11px] text-[#929aaa]"><input type="checkbox" disabled={busy} checked={channel.quietHoursEnabled} onChange={() => void updateChannel(channel, { quietHoursEnabled: !channel.quietHoursEnabled })} />Quiet hours</label>
                  <label className="flex items-center gap-2 text-[11px] text-[#929aaa]">From <input type="time" disabled={busy || !channel.quietHoursEnabled} defaultValue={channel.quietHoursStart} onBlur={(event) => { if (event.target.value && event.target.value !== channel.quietHoursStart) void updateChannel(channel, { quietHoursStart: event.target.value }); }} className="rounded-md border border-white/10 bg-[#0c1018] px-2 py-1 text-xs text-white" /></label>
                  <label className="flex items-center gap-2 text-[11px] text-[#929aaa]">Until <input type="time" disabled={busy || !channel.quietHoursEnabled} defaultValue={channel.quietHoursEnd} onBlur={(event) => { if (event.target.value && event.target.value !== channel.quietHoursEnd) void updateChannel(channel, { quietHoursEnd: event.target.value }); }} className="rounded-md border border-white/10 bg-[#0c1018] px-2 py-1 text-xs text-white" /></label>
                  <label className="flex items-center gap-2 text-[11px] text-[#929aaa]">Timezone <input type="text" maxLength={64} disabled={busy || !channel.quietHoursEnabled} defaultValue={channel.timezone} onBlur={(event) => { if (event.target.value.trim() && event.target.value.trim() !== channel.timezone) void updateChannel(channel, { timezone: event.target.value.trim() }); }} placeholder="Africa/Accra" className="w-36 rounded-md border border-white/10 bg-[#0c1018] px-2 py-1 text-xs text-white" /></label>
                </div>
              </div>}</div>
            <div className="flex gap-2">{!channel.verifiedAt && <button disabled={busy} onClick={() => void resend(channel)} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-[#c2c8d3]">Resend</button>}{channel.verifiedAt && <button disabled={busy} onClick={() => void toggleChannel(channel)} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-[#c2c8d3]">{channel.enabled ? "Pause" : "Enable"}</button>}<button disabled={busy} onClick={() => void remove(channel)} className="rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-300">Remove</button></div>
          </div>)}
          {!channels.length && <p className="py-5 text-sm text-[#737b89]">No notification channels configured.</p>}
        </div>
      </> : <p className="mt-5 text-xs text-[#737b89]">Only organization owners and admins can manage notification channels. Recent delivery history remains visible below.</p>}
      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Recent deliveries</h3><span className="text-xs text-[#737b89]">Latest 25</span></div>
        <div className="mt-3 divide-y divide-white/10">
          {deliveries.map((delivery) => <div key={delivery.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div><p className="text-xs font-medium">{delivery.eventType.replaceAll(".", " ")}</p><p className="mt-1 text-[11px] text-[#737b89]">{delivery.target}</p><p className="mt-1 text-[11px] text-[#737b89]">{formatDate(delivery.createdAt)} · {delivery.attempts} attempt{delivery.attempts === 1 ? "" : "s"}</p>{delivery.lastErrorCode && <p className="mt-1 text-[11px] text-red-300">{delivery.lastErrorCode}</p>}</div>
            <span className={`rounded-full px-2 py-1 text-[10px] ${delivery.status === "sent" ? "bg-[#d9f36a]/10 text-[#d9f36a]" : delivery.status === "failed" ? "bg-red-400/10 text-red-300" : "bg-white/10 text-[#929aaa]"}`}>{delivery.status}</span>
          </div>)}
          {!deliveries.length && <p className="py-5 text-sm text-[#737b89]">No notification deliveries yet.</p>}
        </div>
      </div>
    </section>
  );
}
