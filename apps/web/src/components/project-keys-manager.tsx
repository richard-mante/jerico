"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { authClient } from "../../../../../lib/auth-client";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

type Environment = { id: string; name: string; slug: string; isProduction: boolean };
type IngestionKey = {
  id: string;
  name: string;
  keyType: "public" | "secret";
  keyPrefix: string;
  environmentId: string;
  environmentName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function ProjectKeysManager() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: session, isPending } = authClient.useSession();
  const organizationId = session?.session.activeOrganizationId ?? "";
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [keys, setKeys] = useState<IngestionKey[]>([]);
  const [name, setName] = useState("Production browser");
  const [environmentId, setEnvironmentId] = useState("");
  const [keyType, setKeyType] = useState<"public" | "secret">("public");
  const [newKey, setNewKey] = useState("");
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
    return payload.data;
  }

  async function refresh() {
    if (!organizationId || !projectId) return;
    const [environmentData, keyData] = await Promise.all([
      request(`/api/v1/projects/${projectId}/environments`),
      request(`/api/v1/projects/${projectId}/keys`),
    ]);
    setEnvironments(environmentData as Environment[]);
    setKeys(keyData as IngestionKey[]);
    setEnvironmentId((current) => current || (environmentData[0]?.id ?? ""));
  }

  useEffect(() => {
    if (!organizationId || !projectId) return;
    void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load project keys."));
  }, [organizationId, projectId]);

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setNewKey("");
    try {
      const created = await request(`/api/v1/projects/${projectId}/keys`, {
        method: "POST",
        body: JSON.stringify({ name, environmentId, keyType }),
      });
      setNewKey(created.rawKey as string);
      setNotice("Credential created. Copy it now; Jerico will not show the full value again.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create credential.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(keyId: string) {
    if (!window.confirm("Revoke this credential? Applications using it will stop being able to send telemetry.")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`/api/v1/projects/${projectId}/keys/${keyId}`, { method: "DELETE" });
      setNotice("Credential revoked.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not revoke credential.");
    } finally {
      setBusy(false);
    }
  }

  if (isPending) return <main className="min-h-screen bg-[#090b10] p-8 text-sm text-[#929aaa]">Loading project credentials…</main>;
  if (!session) return <main className="min-h-screen bg-[#090b10] p-8 text-[#f5f7fb]"><Link href="/sign-in">Sign in to manage credentials</Link></main>;

  return (
    <main className="min-h-screen bg-[#090b10] px-5 py-8 text-[#f5f7fb] sm:px-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/dashboard" className="text-sm text-[#a8afbd] hover:text-white">← Back to workspace</Link>
        <header className="mt-8 border-b border-white/10 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d9f36a]">Project settings</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Ingestion credentials</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#929aaa]">Create environment-scoped credentials for browser and server applications. Public keys are designed for browser use; secret keys must remain on your server.</p>
        </header>

        {error && <p role="alert" className="mt-6 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</p>}
        {notice && <p role="status" className="mt-6 rounded-xl border border-[#d9f36a]/20 bg-[#d9f36a]/5 px-4 py-3 text-sm text-[#d9f36a]">{notice}</p>}

        {newKey && (
          <section className="mt-6 rounded-2xl border border-[#d9f36a]/30 bg-[#d9f36a]/5 p-5">
            <h2 className="font-semibold">Copy your new credential</h2>
            <p className="mt-2 text-sm text-[#a8afbd]">This is the only time the complete credential will be displayed. Store it securely.</p>
            <code className="mt-4 block break-all rounded-xl border border-white/10 bg-black/30 p-4 text-sm">{newKey}</code>
            <button onClick={() => void navigator.clipboard.writeText(newKey)} className="mt-4 rounded-xl bg-[#d9f36a] px-4 py-2 text-sm font-semibold text-[#15190b]">Copy credential</button>
          </section>
        )}

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] p-6">
          <h2 className="text-lg font-semibold">Create credential</h2>
          <form onSubmit={createKey} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm"><span className="block text-[#a8afbd]">Credential name</span><input required minLength={2} maxLength={60} value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3 outline-none focus:border-[#d9f36a]/60" /></label>
            <label className="space-y-2 text-sm"><span className="block text-[#a8afbd]">Environment</span><select required value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3">{environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}</select></label>
            <label className="space-y-2 text-sm sm:col-span-2"><span className="block text-[#a8afbd]">Credential type</span><select value={keyType} onChange={(event) => setKeyType(event.target.value as "public" | "secret")} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3"><option value="public">Public — browser SDK, event submission only</option><option value="secret">Secret — server-side SDK, never expose to browsers</option></select></label>
            <div className="sm:col-span-2"><button disabled={busy || !environmentId} className="rounded-xl bg-[#d9f36a] px-4 py-3 text-sm font-semibold text-[#15190b] disabled:opacity-50">{busy ? "Working…" : "Generate credential"}</button></div>
          </form>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Existing credentials</h2><span className="text-xs text-[#929aaa]">{keys.length} total</span></div>
          <div className="mt-4 space-y-3">
            {keys.map((key) => (
              <article key={key.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{key.name}</h3><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-wider text-[#a8afbd]">{key.keyType}</span>{key.revokedAt && <span className="rounded-full border border-red-400/20 px-2 py-1 text-[10px] text-red-300">Revoked</span>}</div><p className="mt-2 font-mono text-xs text-[#929aaa]">{key.keyPrefix}…</p><p className="mt-2 text-xs text-[#737b89]">{key.environmentName ?? "Environment"} · Created {new Date(key.createdAt).toLocaleDateString()} · {key.lastUsedAt ? "Used " + new Date(key.lastUsedAt).toLocaleString() : "Not used yet"}</p></div>
                  {!key.revokedAt && <button disabled={busy} onClick={() => void revokeKey(key.id)} className="rounded-lg border border-red-400/25 px-3 py-2 text-xs text-red-300 hover:bg-red-400/5 disabled:opacity-50">Revoke</button>}
                </div>
              </article>
            ))}
            {!keys.length && <p className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-[#737b89]">No ingestion credentials yet. Generate one to connect an application.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
