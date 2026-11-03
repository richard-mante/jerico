"use client";

import Link from "next/link";
import { useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export function NotificationVerification({ token }: { token: string }) {
  const [status, setStatus] = useState<"ready" | "loading" | "verified" | "error">(token ? "ready" : "error");
  const [message, setMessage] = useState(token
    ? "Confirm this address to enable incident notifications."
    : "This verification link is missing its token.");
  async function verify() {
    if (!token || status === "loading" || status === "verified") return;
    setStatus("loading"); setMessage("Verifying your notification email…");
    try {
      const response = await fetch(apiBase + "/api/v1/notification-channels/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "This verification link is invalid or expired.");
      setStatus("verified"); setMessage("Your email address is verified. It can now receive Jerico incident notifications.");
    } catch (cause) {
      setStatus("error"); setMessage(cause instanceof Error ? cause.message : "Could not verify this email address.");
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090b10] px-6 text-[#f5f7fb]">
      <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
        <div className="mx-auto grid size-11 place-items-center rounded-xl bg-[#d9f36a] font-black text-[#15190b]">J</div>
        <h1 className="mt-5 text-2xl font-semibold">Notification email verification</h1>
        <p role={status === "error" ? "alert" : "status"} className={`mt-3 text-sm leading-6 ${status === "error" ? "text-red-300" : status === "verified" ? "text-[#d9f36a]" : "text-[#a8afbd]"}`}>{message}</p>
        {status !== "verified" && <button disabled={status === "loading" || !token} onClick={() => void verify()} className="mt-6 rounded-xl bg-[#d9f36a] px-4 py-3 text-sm font-semibold text-[#15190b] disabled:opacity-50">{status === "loading" ? "Verifying…" : "Verify email address"}</button>}
        <div><Link href="/dashboard" className="mt-6 inline-flex rounded-xl border border-white/15 px-4 py-3 text-sm text-[#c2c8d3] hover:bg-white/5">Return to dashboard</Link></div>
      </section>
    </main>
  );
}
