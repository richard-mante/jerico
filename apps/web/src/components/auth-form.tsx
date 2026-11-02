"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "../lib/auth-client";

type AuthFormProps = { mode: "sign-in" | "sign-up" };

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isSignUp = mode === "sign-up";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = isSignUp
        ? await authClient.signUp.email({ name, email, password, callbackURL: "/" })
        : await authClient.signIn.email({ email, password, callbackURL: "/" });
      if (result.error) {
        setError(result.error.message ?? "Authentication failed. Please try again.");
      } else if (isSignUp) {
        setMessage("Account created. Check your email for a verification link before signing in.");
      } else {
        router.replace("/");
        router.refresh();
      }
    } catch {
      setError("We could not reach the authentication service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090b10] px-5 py-12 text-[#f5f7fb]">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.035] p-7 sm:p-9">
        <Link href="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[#d9f36a] text-sm font-black text-[#15190b]">J</span>jerico
        </Link>
        <p className="mt-9 text-xs font-semibold uppercase tracking-[0.2em] text-[#d9f36a]">{isSignUp ? "Create your workspace identity" : "Welcome back"}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{isSignUp ? "Create your account" : "Sign in to Jerico"}</h1>
        <p className="mt-3 text-sm leading-6 text-[#929aaa]">{isSignUp ? "Start with an account. You can create or join an organization next." : "Continue to your projects and observability workspace."}</p>
        <form className="mt-8 space-y-4" onSubmit={submit}>
          {isSignUp && <label className="block space-y-2 text-sm"><span className="text-[#c3c9d3]">Full name</span><input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3 outline-none transition focus:border-[#d9f36a]/60" /></label>}
          <label className="block space-y-2 text-sm"><span className="text-[#c3c9d3]">Email address</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3 outline-none transition focus:border-[#d9f36a]/60" /></label>
          <label className="block space-y-2 text-sm"><span className="text-[#c3c9d3]">Password</span><input type="password" autoComplete={isSignUp ? "new-password" : "current-password"} required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3 outline-none transition focus:border-[#d9f36a]/60" /><span className="block text-xs text-[#737b89]">Use at least 12 characters.</span></label>
          {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 px-3 py-2 text-sm text-red-300">{error}</p>}
          {message && <p role="status" className="rounded-xl border border-[#d9f36a]/20 bg-[#d9f36a]/5 px-3 py-2 text-sm text-[#d9f36a]">{message}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-[#d9f36a] px-4 py-3 text-sm font-semibold text-[#15190b] transition hover:bg-[#e4fa7c] disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}</button>
        </form>
        <p className="mt-7 text-center text-sm text-[#929aaa]">{isSignUp ? "Already have an account?" : "New to Jerico?"}{" "}<Link className="font-medium text-[#d9f36a] hover:underline" href={isSignUp ? "/sign-in" : "/sign-up"}>{isSignUp ? "Sign in" : "Create an account"}</Link></p>
      </section>
    </main>
  );
}
