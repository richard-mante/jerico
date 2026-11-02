import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090b10] px-6 text-white">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#d9f36a]">404</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">This page isn&apos;t here.</h1>
        <p className="mt-3 text-sm leading-6 text-[#a8afbd]">The page may have moved, or the address may be incorrect.</p>
        <Link className="mt-7 inline-flex rounded-xl bg-[#d9f36a] px-4 py-2.5 text-sm font-semibold text-[#15190b]" href="/">Back to Jerico</Link>
      </div>
    </main>
  );
}
