"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "../lib/auth-client";

type Organization = { id: string; name: string; slug: string };
type Project = { id: string; name: string; slug: string; platform: string; status: string };
const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

function slugify(value: string) {
  return value.normalize("NFKD").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "workspace";
}

export function DashboardOnboarding() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { data: organizations, isPending: organizationsPending } = authClient.useListOrganizations();
  const [organizationList, setOrganizationList] = useState<Organization[]>([]);
  const [organizationName, setOrganizationName] = useState("");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [platform, setPlatform] = useState("web");
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (organizations) setOrganizationList(organizations as Organization[]);
  }, [organizations]);

  useEffect(() => {
    if (!selectedOrganizationId && organizationList.length) setSelectedOrganizationId(organizationList[0].id);
  }, [organizationList, selectedOrganizationId]);

  useEffect(() => {
    if (!selectedOrganizationId) {
      setProjects([]);
      return;
    }
    void authClient.organization.setActive({ organizationId: selectedOrganizationId });
    void fetch(apiBase + "/api/v1/projects", {
      credentials: "include",
      headers: { "X-Jerico-Organization-Id": selectedOrganizationId },
    }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not load projects.");
      setProjects(payload.data ?? []);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load projects."));
  }, [selectedOrganizationId]);

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await authClient.organization.create({
        name: organizationName.trim(),
        slug: slugify(organizationName),
        keepCurrentActiveOrganization: false,
      });
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Could not create organization.");
      setOrganizationList((current) => [...current, result.data as Organization]);
      setSelectedOrganizationId(result.data.id);
      setOrganizationName("");
      setNotice("Your organization is ready.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create organization.");
    } finally {
      setBusy(false);
    }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrganizationId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(apiBase + "/api/v1/projects", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Jerico-Organization-Id": selectedOrganizationId },
        body: JSON.stringify({ name: projectName.trim(), platform }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not create project.");
      const created = payload.data as Project;
      setProjects((current) => [...current, created]);
      setProjectName("");
      setNotice("Project created with Development and Production environments.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create project.");
    } finally {
      setBusy(false);
    }
  }

  if (sessionPending || organizationsPending) {
    return <main className="flex min-h-screen items-center justify-center bg-[#090b10] text-sm text-[#929aaa]">Loading your Jerico workspace…</main>;
  }
  if (!session) {
    return <main className="flex min-h-screen items-center justify-center bg-[#090b10] px-6 text-[#f5f7fb]"><div className="text-center"><h1 className="text-2xl font-semibold">Sign in to continue</h1><p className="mt-3 text-sm text-[#929aaa]">Your projects are available after you sign in.</p><Link href="/sign-in" className="mt-6 inline-flex rounded-xl bg-[#d9f36a] px-4 py-3 text-sm font-semibold text-[#15190b]">Sign in</Link></div></main>;
  }

  return (
    <main className="min-h-screen bg-[#090b10] px-5 py-8 text-[#f5f7fb] sm:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <Link href="/" className="flex items-center gap-3 text-lg font-semibold"><span className="grid size-9 place-items-center rounded-xl bg-[#d9f36a] text-sm font-black text-[#15190b]">J</span>jerico</Link>
          <div className="flex items-center gap-4 text-sm text-[#a8afbd]"><Link href="/dashboard/team" className="hover:text-white">Team</Link><span>{session.user.name}</span><button onClick={() => authClient.signOut()} className="hover:text-white">Sign out</button></div>
        </header>

        <section className="py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d9f36a]">Your workspace</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Let&apos;s get your projects in view.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#929aaa]">Create an organization to keep your team and resources together, then add the first application you want Jerico to observe.</p>
        </section>

        {error && <p role="alert" className="mb-5 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</p>}
        {notice && <p role="status" className="mb-5 rounded-xl border border-[#d9f36a]/20 bg-[#d9f36a]/5 px-4 py-3 text-sm text-[#d9f36a]">{notice}</p>}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#d9f36a]">01 · Organization</p>
            <h2 className="mt-3 text-xl font-semibold">Your team or company</h2>
            {organizationList.length ? (
              <label className="mt-5 block space-y-2 text-sm"><span className="text-[#a8afbd]">Active organization</span><select value={selectedOrganizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3">{organizationList.map((organization: Organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
            ) : (
              <form className="mt-5 space-y-3" onSubmit={createOrganization}>
                <label className="block space-y-2 text-sm"><span className="text-[#a8afbd]">Organization name</span><input required minLength={2} maxLength={80} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="e.g. Acme Studio" className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3 outline-none focus:border-[#d9f36a]/60" /></label>
                <button disabled={busy} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-medium hover:bg-white/5 disabled:opacity-50">{busy ? "Creating…" : "Create organization"}</button>
              </form>
            )}
            <p className="mt-4 text-xs leading-5 text-[#737b89]">Organizations isolate your projects, team members, and monitoring data.</p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#d9f36a]">02 · First project</p>
            <h2 className="mt-3 text-xl font-semibold">Add an application</h2>
            <form className="mt-5 space-y-3" onSubmit={createProject}>
              <label className="block space-y-2 text-sm"><span className="text-[#a8afbd]">Project name</span><input required minLength={2} maxLength={80} value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="e.g. Customer dashboard" className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3 outline-none focus:border-[#d9f36a]/60" /></label>
              <label className="block space-y-2 text-sm"><span className="text-[#a8afbd]">Application type</span><select value={platform} onChange={(event) => setPlatform(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3"><option value="web">Web application</option><option value="server">Backend / API</option><option value="desktop">Desktop application</option><option value="mobile">Mobile application</option><option value="other">Other</option></select></label>
              <button disabled={busy || !selectedOrganizationId} className="rounded-xl bg-[#d9f36a] px-4 py-3 text-sm font-semibold text-[#15190b] disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Working…" : "Create project"}</button>
            </form>
            <p className="mt-4 text-xs leading-5 text-[#737b89]">Jerico creates Development and Production environments for every new project.</p>
          </section>
        </div>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-6">
          <div className="flex items-center justify-between"><div><h2 className="font-semibold">Projects</h2><p className="mt-1 text-xs text-[#737b89]">Applications in the selected organization</p></div><span className="text-xs text-[#929aaa]">{projects.length} total</span></div>
          {projects.length ? <div className="mt-5 divide-y divide-white/10">{projects.map((project) => <div key={project.id} className="flex items-center justify-between py-4"><div><p className="text-sm font-medium">{project.name}</p><p className="mt-1 text-xs text-[#737b89]">{project.slug} · {project.platform}</p></div><div className="flex items-center gap-3"><span className="rounded-full border border-white/10 px-3 py-1 text-xs text-[#a8afbd]">{project.status}</span><Link href={`/dashboard/projects/${project.id}/observability?organizationId=${encodeURIComponent(selectedOrganizationId)}`} className="rounded-lg border border-[#d9f36a]/25 px-3 py-2 text-xs font-medium text-[#d9f36a] hover:bg-[#d9f36a]/5">Observability</Link><Link href={`/dashboard/projects/${project.id}/uptime`} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-[#a8afbd] hover:bg-white/5">Uptime</Link><Link href={`/dashboard/projects/${project.id}/alerts`} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-[#a8afbd] hover:bg-white/5">Alerts</Link><Link href={`/dashboard/projects/${project.id}/keys`} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-[#a8afbd] hover:bg-white/5">Ingestion keys</Link><Link href={`/dashboard/projects/${project.id}/environments`} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-[#a8afbd] hover:bg-white/5">Environments</Link><Link href={`/dashboard/projects/${project.id}/settings`} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-[#a8afbd] hover:bg-white/5">Settings</Link></div></div>)}</div> : <p className="mt-5 rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-[#737b89]">No projects yet. Create your first project above.</p>}
        </section>
      </div>
    </main>
  );
}
