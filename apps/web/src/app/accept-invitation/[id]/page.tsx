"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "../../../lib/auth-client";

export default function AcceptInvitationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const invitationId = params.id;
  const { data: session, isPending } = authClient.useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function acceptInvitation() {
    if (!invitationId) {
      setError("This invitation link is incomplete.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await authClient.organization.acceptInvitation({ invitationId });
      if (result.error) {
        setError(result.error.message ?? "We could not accept this invitation.");
        return;
      }
      setNotice("Invitation accepted. Your organization is ready.");
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("We could not reach Jerico. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090b10] px-5 py-12 text-[#f5f7fb]">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.035] p-8">
        <Link href="/" className="flex items-center gap-3 text-lg font-semibold">
          <span className="grid size-9 place-items-center rounded-xl bg-[#d9f36a] text-sm font-black text-[#15190b]">J</span>
          jerico
        </Link>
        <p className="mt-9 text-xs font-semibold uppercase tracking-[0.2em] text-[#d9f36a]">Organization invitation</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">You&apos;ve been invited</h1>
        <p className="mt-3 text-sm leading-7 text-[#929aaa]">
          Sign in with the email address that received this invitation, then accept it to join the organization.
        </p>

        {isPending ? (
          <p className="mt-8 text-sm text-[#929aaa]">Checking your session…</p>
        ) : session ? (
          <div className="mt-8 space-y-4">
            <p className="rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3 text-sm text-[#a8afbd]">
              Signed in as <span className="font-medium text-white">{session.user.email}</span>
            </p>
            <button onClick={acceptInvitation} disabled={busy || !invitationId} className="w-full rounded-xl bg-[#d9f36a] px-4 py-3 text-sm font-semibold text-[#15190b] disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? "Accepting invitation…" : "Accept invitation"}
            </button>
            <p className="text-xs leading-5 text-[#737b89]">The signed-in email must match the address the invitation was sent to.</p>
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            <Link href="/sign-in" className="block rounded-xl bg-[#d9f36a] px-4 py-3 text-center text-sm font-semibold text-[#15190b]">
              Sign in to accept
            </Link>
            <Link href="/sign-up" className="block rounded-xl border border-white/15 px-4 py-3 text-center text-sm font-medium hover:bg-white/5">
              Create an account
            </Link>
            <p className="text-xs leading-5 text-[#737b89]">After signing in, open this invitation link again to complete the process.</p>
          </div>
        )}

        {error && <p role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</p>}
        {notice && <p role="status" className="mt-5 rounded-xl border border-[#d9f36a]/20 bg-[#d9f36a]/5 px-4 py-3 text-sm text-[#d9f36a]">{notice}</p>}
      </section>
    </main>
  );
}
