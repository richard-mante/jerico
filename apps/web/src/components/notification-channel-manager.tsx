"use client";

import { useEffect, useState, type FormEvent } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
type Channel = { id: string; type: string; target: string; verifiedAt: string | null; enabled: boolean; createdAt: string };
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
  async function resend(channel: Channel) {
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/v1/notification-channels/${encodeURIComponent(channel.id)}/resend-verification`, { method: "POST" });
      setNotice("A new verification email has been sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resend verification email.");
    } finally { setBusy(false); }
  }
  async function remove(channel: Channel) {
    if (!window.confirm(`Remove ${channel.target} from incident notifications?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/v1/notification-channels/${encodeURIComponent(channel.id)}`, { method: "DELETE" });
      setNotice("Notification email removed."); await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove notification email.");
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
      <div><h2 className="font-semibold">Notification delivery</h2><p className="mt-1 text-xs text-[#737b89]">Verified email channels receive incident opened, acknowledged, and resolved updates.</p></div>
      {error && <p role="alert" className="mt-4 text-xs text-red-300">{error}</p>}
      {notice && <p role="status" className="mt-4 text-xs text-[#d9f36a]">{notice}</p>}
      {canManageChannels ? <>
        <form onSubmit={addEmail} className="mt-5 flex flex-wrap gap-2">
          <input type="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ops@yourcompany.com" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3 text-sm outline-none focus:border-[#d9f36a]/60" />
          <button disabled={busy || !organizationId} className="rounded-xl bg-[#d9f36a] px-4 py-3 text-sm font-semibold text-[#15190b] disabled:opacity-50">{busy ? "Working…" : "Add email"}</button>
        </form>
        <div className="mt-4 divide-y divide-white/10">
          {channels.map((channel) => <div key={channel.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div><p className="text-sm">{channel.target}</p><p className="mt-1 text-xs text-[#737b89]">{channel.verifiedAt ? "Verified" : "Verification pending"}</p></div>
            <div className="flex gap-2">{!channel.verifiedAt && <button disabled={busy} onClick={() => void resend(channel)} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-[#c2c8d3]">Resend</button>}<button disabled={busy} onClick={() => void remove(channel)} className="rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-300">Remove</button></div>
          </div>)}
          {!channels.length && <p className="py-5 text-sm text-[#737b89]">No email channels configured.</p>}
        </div>
      </> : <p className="mt-5 text-xs text-[#737b89]">Only organization owners and admins can manage notification email channels. Recent delivery history remains visible below.</p>}
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
