"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "../lib/auth-client";
const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
type Project = { id: string; name: string; slug: string; platform: "web" | "server" | "desktop" | "mobile" | "other"; framework: string | null; status: "active" | "archived" };
const platforms = [{ value: "web", label: "Web application" }, { value: "server", label: "Backend / API" }, { value: "desktop", label: "Desktop application" }, { value: "mobile", label: "Mobile application" }, { value: "other", label: "Other" }];
function slugify(value: string) { return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "project"; }
export function ProjectSettingsManager() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: session, isPending } = authClient.useSession();
  const organizationId = session?.session.activeOrganizationId ?? "";
  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState(""); const [slug, setSlug] = useState(""); const [platform, setPlatform] = useState<Project["platform"]>("web"); const [framework, setFramework] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function request(path: string, init?: RequestInit) {
    const response = await fetch(apiBase + path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(init?.body ? { "Content-Type": "application/json" } : {}), "X-Jerico-Organization-Id": organizationId } });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "The request could not be completed."); return payload.data;
  }
  async function refresh() { if (!organizationId || !projectId) return; const row = await request(`/api/v1/projects/${encodeURIComponent(projectId)}`) as Project; setProject(row); setName(row.name); setSlug(row.slug); setPlatform(row.platform); setFramework(row.framework ?? ""); }
  useEffect(() => { if (organizationId && projectId) void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load project settings.")); }, [organizationId, projectId]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { const updated = await request(`/api/v1/projects/${encodeURIComponent(projectId)}`, { method: "PATCH", body: JSON.stringify({ name: name.trim(), slug: slugify(slug || name), platform, framework: framework.trim() || undefined }) }) as Project; setProject(updated); setNotice("Project settings saved."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save project settings."); } finally { setBusy(false); }
  }
  async function toggleArchive() {
    if (!project) return; const next = project.status === "active" ? "archived" : "active";
    if (next === "archived" && !window.confirm("Archive this project? New telemetry ingestion will stop. Existing dashboards and historical data remain available.")) return;
    setBusy(true); setError(""); setNotice("");
    try { const updated = await request(`/api/v1/projects/${encodeURIComponent(projectId)}`, { method: "PATCH", body: JSON.stringify({ status: next }) }) as Project; setProject(updated); setNotice(next === "archived" ? "Project archived. New telemetry ingestion is disabled." : "Project restored. Telemetry ingestion is active again."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update project status."); } finally { setBusy(false); }
  }
  if (isPending) return <main className="min-h-screen bg-[#090b10] p-8 text-sm text-[#929aaa]">Loading project settings…</main>;
  if (!session) return <main className="min-h-screen bg-[#090b10] p-8 text-sm text-[#929aaa]">Sign in to manage project settings.</main>;
  return <main className="min-h-screen bg-[#090b10] px-5 py-8 text-[#f5f7fb] sm:px-10"><div className="mx-auto max-w-4xl">
    <header className="border-b border-white/10 pb-6"><Link href="/dashboard" className="text-sm text-[#929aaa] hover:text-white">← Dashboard</Link><p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#d9f36a]">Project settings</p><div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold">Project details</h1>{project && <span className={`rounded-full px-2 py-1 text-[10px] ${project.status === "active" ? "bg-[#d9f36a]/10 text-[#d9f36a]" : "bg-amber-300/10 text-amber-100"}`}>{project.status}</span>}</div><p className="mt-2 text-sm text-[#929aaa]">Manage the project identity and whether it accepts new telemetry.</p></header>
    {error && <p role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</p>}{notice && <p role="status" className="mt-5 rounded-xl border border-[#d9f36a]/20 bg-[#d9f36a]/5 px-4 py-3 text-sm text-[#d9f36a]">{notice}</p>}
    {project && <div className="mt-8 space-y-6">
      <form onSubmit={save} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"><h2 className="font-semibold">Project identity</h2><div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm"><span className="text-[#a8afbd]">Name</span><input required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3" /></label>
        <label className="space-y-2 text-sm"><span className="text-[#a8afbd]">Slug</span><input required minLength={2} maxLength={60} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(event) => setSlug(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3" /></label>
        <label className="space-y-2 text-sm"><span className="text-[#a8afbd]">Application type</span><select value={platform} onChange={(event) => setPlatform(event.target.value as Project["platform"])} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3">{platforms.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="space-y-2 text-sm"><span className="text-[#a8afbd]">Framework (optional)</span><input maxLength={80} value={framework} onChange={(event) => setFramework(event.target.value)} placeholder="Next.js, Hono, Rails…" className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3" /></label>
      </div><button disabled={busy} className="mt-5 rounded-xl bg-[#d9f36a] px-4 py-3 text-sm font-semibold text-[#15190b] disabled:opacity-50">{busy ? "Saving…" : "Save project"}</button></form>
      <section className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.03] p-6"><h2 className="font-semibold">Project availability</h2><p className="mt-2 text-sm leading-6 text-[#929aaa]">{project.status === "active" ? "Archiving stops new telemetry ingestion for every credential in this project. Existing telemetry, incidents, uptime history, and settings remain available." : "This project is archived. New telemetry ingestion is blocked. Restore it to accept events again."}</p><button disabled={busy} onClick={() => void toggleArchive()} className="mt-4 rounded-xl border border-amber-300/25 px-4 py-3 text-sm text-amber-100 disabled:opacity-50">{project.status === "active" ? "Archive project" : "Restore project"}</button></section>
    </div>}</div></main>;
}
