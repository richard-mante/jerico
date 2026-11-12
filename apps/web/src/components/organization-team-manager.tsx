"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "../lib/auth-client";
type Organization = { id: string; name: string; slug: string };
type TeamMember = { id: string; userId: string; role: string; user: { name: string; email: string; image?: string | null } };
type Invitation = { id: string; email: string; role: string; status: string; expiresAt: string };
export function OrganizationTeamManager() {
  const { data: session, isPending } = authClient.useSession();
  const { data: organizations } = authClient.useListOrganizations();
  const organizationId = session?.session.activeOrganizationId ?? "";
  const [organizationList, setOrganizationList] = useState<Organization[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [canManageTeam, setCanManageTeam] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [email, setEmail] = useState(""); const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  useEffect(() => { if (organizations) setOrganizationList(organizations as Organization[]); }, [organizations]);
  async function refresh() {
    if (!organizationId) return;
    const [roleResult, organizationResult] = await Promise.all([
      authClient.organization.getActiveMemberRole(),
      authClient.organization.getOrganization({ organizationId }),
    ]);
    if (roleResult.error) throw new Error(roleResult.error.message);
    if (organizationResult.error) throw new Error(organizationResult.error.message);
    const org = organizationResult.data as unknown as Organization;
    setOrganizationName(org.name); setOrganizationSlug(org.slug);
    const roleData = roleResult.data as unknown as { role?: string } | string | null;
    const activeRole = typeof roleData === "string" ? roleData : roleData?.role ?? "";
    const manageable = activeRole === "owner" || activeRole === "admin";
    setCanManageTeam(manageable);
    if (!manageable) { setMembers([]); setInvitations([]); return; }
    const [memberResult, invitationResult] = await Promise.all([
      authClient.organization.listMembers({ query: { organizationId, limit: 100 } }),
      authClient.organization.listInvitations({ query: { organizationId } }),
    ]);
    if (memberResult.error) throw new Error(memberResult.error.message);
    if (invitationResult.error) throw new Error(invitationResult.error.message);
    const memberData = memberResult.data as unknown as { members?: TeamMember[] };
    setMembers(memberData.members ?? []);
    setInvitations((invitationResult.data ?? []) as Invitation[]);
  }
  useEffect(() => { if (organizationId) void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load team members.")); }, [organizationId]);
  async function saveOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { const result = await authClient.organization.update({ organizationId, data: { name: organizationName.trim(), slug: organizationSlug.trim() } }); if (result.error) throw new Error(result.error.message); setNotice("Organization settings saved."); setOrganizationList((current) => current.map((item) => item.id === organizationId ? { ...item, name: organizationName.trim(), slug: organizationSlug.trim() } : item)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update organization."); } finally { setBusy(false); }
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { const result = await authClient.organization.inviteMember({ email: email.trim(), role }); if (result.error) throw new Error(result.error.message); setEmail(""); setNotice("Invitation sent."); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not invite team member."); } finally { setBusy(false); }
  }
  async function changeRole(member: TeamMember, nextRole: "member" | "admin") {
    setBusy(true); setError(""); setNotice("");
    try { const result = await authClient.organization.updateMemberRole({ memberId: member.id, role: nextRole }); if (result.error) throw new Error(result.error.message); setNotice("Member role updated."); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update member role."); } finally { setBusy(false); }
  }
  async function removeMember(member: TeamMember) {
    if (!window.confirm(`Remove ${member.user.name} (${member.user.email}) from this organization?`)) return;
    setBusy(true); setError(""); setNotice("");
    try { const result = await authClient.organization.removeMember({ memberIdOrEmail: member.id }); if (result.error) throw new Error(result.error.message); setNotice("Member removed."); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove member."); } finally { setBusy(false); }
  }
  async function cancelInvitation(invitation: Invitation) {
    setBusy(true); setError(""); setNotice("");
    try { const result = await authClient.organization.cancelInvitation({ invitationId: invitation.id }); if (result.error) throw new Error(result.error.message); setNotice("Invitation cancelled."); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not cancel invitation."); } finally { setBusy(false); }
  }
  if (isPending) return <main className="min-h-screen bg-[#090b10] p-8 text-sm text-[#929aaa]">Loading organization team…</main>;
  if (!session) return <main className="min-h-screen bg-[#090b10] p-8 text-sm text-[#929aaa]">Sign in to manage your team.</main>;
  return <main className="min-h-screen bg-[#090b10] px-5 py-8 text-[#f5f7fb] sm:px-10"><div className="mx-auto max-w-5xl">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6"><div><Link href="/dashboard" className="text-sm text-[#929aaa] hover:text-white">← Workspace</Link><p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#d9f36a]">Organization</p><h1 className="mt-2 text-3xl font-semibold">Team and access</h1><p className="mt-2 text-sm text-[#929aaa]">Invite collaborators and manage their organization roles.</p></div><span className="text-sm text-[#929aaa]">{organizationList.find((item) => item.id === organizationId)?.name ?? "Active organization"}</span></header>
    {error && <p role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</p>}{notice && <p role="status" className="mt-5 rounded-xl border border-[#d9f36a]/20 bg-[#d9f36a]/5 px-4 py-3 text-sm text-[#d9f36a]">{notice}</p>}
    {!canManageTeam ? <p className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-6 text-sm text-[#929aaa]">Only organization owners and admins can manage team access.</p> : <><form onSubmit={saveOrganization} className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:grid-cols-[1fr_1fr_auto]"><label className="space-y-2 text-sm"><span className="text-[#a8afbd]">Organization name</span><input required minLength={2} maxLength={80} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3" /></label><label className="space-y-2 text-sm"><span className="text-[#a8afbd]">Organization slug</span><input required minLength={2} maxLength={60} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={organizationSlug} onChange={(event) => setOrganizationSlug(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3" /></label><button disabled={busy} className="self-end rounded-xl bg-[#d9f36a] px-4 py-3 text-sm font-semibold text-[#15190b]">Save organization</button></form><div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <section className="h-fit rounded-2xl border border-white/10 bg-white/[0.035] p-6"><h2 className="font-semibold">Invite a teammate</h2><form onSubmit={invite} className="mt-5 space-y-4"><label className="block space-y-2 text-sm"><span className="text-[#a8afbd]">Email address</span><input type="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@company.com" className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3" /></label><label className="block space-y-2 text-sm"><span className="text-[#a8afbd]">Role</span><select value={role} onChange={(event) => setRole(event.target.value as "member" | "admin")} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3"><option value="member">Member</option><option value="admin">Admin</option></select></label><button disabled={busy || !organizationId} className="w-full rounded-xl bg-[#d9f36a] px-4 py-3 text-sm font-semibold text-[#15190b] disabled:opacity-50">{busy ? "Working…" : "Send invitation"}</button></form><p className="mt-4 text-xs leading-5 text-[#737b89]">Invitations are sent by email. Invitees must verify their email before joining.</p></section>
      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Organization members</h2><p className="mt-1 text-xs text-[#737b89]">People with access to this organization</p></div><span className="text-xs text-[#929aaa]">{members.length} members</span></div><div className="mt-4 divide-y divide-white/10">{members.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-medium">{item.user.name}</p><p className="mt-1 text-xs text-[#929aaa]">{item.user.email}</p></div><div className="flex items-center gap-2">{item.role === "owner" ? <span className="rounded-full bg-[#d9f36a]/10 px-2 py-1 text-[10px] text-[#d9f36a]">Owner</span> : <><select disabled={busy} value={item.role} onChange={(event) => void changeRole(item, event.target.value as "member" | "admin")} className="rounded-lg border border-white/10 bg-[#0c1018] px-2 py-2 text-xs"><option value="member">Member</option><option value="admin">Admin</option></select><button disabled={busy} onClick={() => void removeMember(item)} className="rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-300">Remove</button></>}</div></div>)}{!members.length && <p className="py-8 text-center text-sm text-[#737b89]">No members found.</p>}</div></section>
    </div>
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-6"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Pending invitations</h2><p className="mt-1 text-xs text-[#737b89]">Invitations awaiting acceptance</p></div><span className="text-xs text-[#929aaa]">{invitations.length} pending</span></div><div className="mt-4 divide-y divide-white/10">{invitations.map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm">{invitation.email}</p><p className="mt-1 text-xs text-[#737b89]">{invitation.role} · Expires {new Date(invitation.expiresAt).toLocaleDateString()}</p></div><button disabled={busy} onClick={() => void cancelInvitation(invitation)} className="rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-300">Cancel invitation</button></div>)}{!invitations.length && <p className="py-6 text-center text-sm text-[#737b89]">No pending invitations.</p>}</div></section>
    </div></>}
  </div></main>;
}
