"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "../lib/auth-client";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
type Environment = { id: string; name: string; slug: string; isProduction: boolean; createdAt: string };
function slugify(value: string) { return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "environment"; }

export function ProjectEnvironmentManager() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: session, isPending } = authClient.useSession();
  const organizationId = session?.session.activeOrganizationId ?? "";
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [production, setProduction] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editProduction, setEditProduction] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function request(path: string, init?: RequestInit) {
    const response = await fetch(apiBase + path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(init?.body ? { "Content-Type": "application/json" } : {}), "X-Jerico-Organization-Id": organizationId } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "The request could not be completed.");
    return payload;
  }
  async function refresh() {
    if (!organizationId || !projectId) return;
    const payload = await request(`/api/v1/projects/${encodeURIComponent(projectId)}/environments`);
    setEnvironments((payload.data ?? []) as Environment[]);
  }
  useEffect(() => { if (organizationId && projectId) void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load environments.")); }, [organizationId, projectId]);

  async function createEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/v1/projects/${encodeURIComponent(projectId)}/environments`, { method: "POST", body: JSON.stringify({ name: name.trim(), slug: slugify(slug || name), isProduction: production }) });
      setName(""); setSlug(""); setProduction(false); setNotice("Environment created."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create environment."); }
    finally { setBusy(false); }
  }
  function beginEdit(environment: Environment) { setEditingId(environment.id); setEditName(environment.name); setEditSlug(environment.slug); setEditProduction(environment.isProduction); }
  async function saveEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingId) return; setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/v1/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(editingId)}`, { method: "PATCH", body: JSON.stringify({ name: editName.trim(), slug: slugify(editSlug || editName), isProduction: editProduction }) });
      setEditingId(null); setNotice("Environment settings saved."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update environment."); }
    finally { setBusy(false); }
  }

  if (isPending) return <main className="min-h-screen bg-[#090b10] p-8 text-sm text-[#929aaa]">Loading environments…</main>;
  if (!session) return <main className="min-h-screen bg-[#090b10] p-8 text-sm text-[#929aaa]">Sign in to manage project environments.</main>;
  return <main className="min-h-screen bg-[#090b10] px-5 py-8 text-[#f5f7fb] sm:px-10"><div className="mx-auto max-w-5xl">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-6"><div><Link href="/dashboard" className="text-sm text-[#929aaa] hover:text-white">← Dashboard</Link><p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#d9f36a]">Project settings</p><h1 className="mt-2 text-3xl font-semibold">Environments</h1><p className="mt-2 text-sm text-[#929aaa]">Separate development, staging, and production telemetry and ingestion credentials.</p></div><Link href={`/dashboard/projects/${projectId}/keys`} className="rounded-xl border border-white/15 px-4 py-3 text-sm text-[#c2c8d3]">Manage ingestion keys</Link></header>
    {error && <p role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</p>}{notice && <p role="status" className="mt-5 rounded-xl border border-[#d9f36a]/20 bg-[#d9f36a]/5 px-4 py-3 text-sm text-[#d9f36a]">{notice}</p>}
    <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="h-fit rounded-2xl border border-white/10 bg-white/[0.035] p-6"><h2 className="font-semibold">Add environment</h2><form onSubmit={createEnvironment} className="mt-5 space-y-4">
        <label className="block space-y-2 text-sm"><span className="text-[#a8afbd]">Name</span><input required minLength={2} maxLength={40} value={name} onChange={(event) => { setName(event.target.value); if (!slug) setSlug(slugify(event.target.value)); }} placeholder="Staging" className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3" /></label>
        <label className="block space-y-2 text-sm"><span className="text-[#a8afbd]">Slug</span><input required minLength={2} maxLength={40} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="staging" className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3" /></label>
        <label className="flex items-center gap-3 text-sm text-[#c2c8d3]"><input type="checkbox" checked={production} onChange={(event) => setProduction(event.target.checked)} /> Set as production environment</label>
        <button disabled={busy} className="w-full rounded-xl bg-[#d9f36a] px-4 py-3 text-sm font-semibold text-[#15190b] disabled:opacity-50">{busy ? "Saving…" : "Create environment"}</button>
      </form><p className="mt-4 text-xs leading-5 text-[#737b89]">Creating an environment does not move existing ingestion keys. Create new keys for the new environment.</p></section>
      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Configured environments</h2><p className="mt-1 text-xs text-[#737b89]">Production is a project-level designation.</p></div><span className="text-xs text-[#929aaa]">{environments.length} total</span></div>
        <div className="mt-4 divide-y divide-white/10">{environments.map((environment) => <div key={environment.id} className="py-4">
          {editingId === environment.id ? <form onSubmit={saveEnvironment} className="space-y-3"><input required minLength={2} maxLength={40} value={editName} onChange={(event) => setEditName(event.target.value)} className="w-full rounded-lg border border-white/10 bg-[#0c1018] px-3 py-2 text-sm" /><input required minLength={2} maxLength={40} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={editSlug} onChange={(event) => setEditSlug(event.target.value)} className="w-full rounded-lg border border-white/10 bg-[#0c1018] px-3 py-2 text-sm" /><label className="flex items-center gap-2 text-xs text-[#c2c8d3]"><input type="checkbox" checked={editProduction} onChange={(event) => setEditProduction(event.target.checked)} /> Production</label><div className="flex gap-2"><button disabled={busy} className="rounded-lg bg-[#d9f36a] px-3 py-2 text-xs font-semibold text-[#15190b]">Save</button><button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-white/15 px-3 py-2 text-xs">Cancel</button></div></form> : <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-sm font-medium">{environment.name}</p>{environment.isProduction && <span className="rounded-full bg-[#d9f36a]/10 px-2 py-1 text-[10px] text-[#d9f36a]">Production</span>}</div><p className="mt-1 font-mono text-xs text-[#737b89]">{environment.slug}</p></div><button disabled={busy} onClick={() => beginEdit(environment)} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-[#c2c8d3]">Edit</button></div>}
        </div>)}{!environments.length && <p className="py-8 text-center text-sm text-[#737b89]">No environments configured.</p>}</div>
      </section>
    </div>
  </div></main>;
}
