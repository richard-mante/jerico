import { Button } from "@jerico/ui/button";

const foundations = [
  { number: "01", title: "Connect your projects", description: "Organize services, environments, and the applications you want to observe." },
  { number: "02", title: "Send useful telemetry", description: "Instrument browser and server applications with the Jerico TypeScript SDKs." },
  { number: "03", title: "Understand what happens", description: "Investigate events, errors, performance, logs, and uptime from one workspace." },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#090b10] text-[#f5f7fb]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-7 sm:px-10">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <a className="flex items-center gap-3" href="/" aria-label="Jerico home">
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#d9f36a] text-sm font-black text-[#15190b]">J</span>
            <span className="text-lg font-semibold tracking-tight">jerico</span>
          </a>
          <nav className="flex items-center gap-4 text-sm"><a className="text-[#a8afbd] transition hover:text-white" href="/sign-in">Sign in</a><a className="rounded-lg bg-[#d9f36a] px-3 py-2 font-medium text-[#15190b]" href="/sign-up">Get started</a></nav>
        </header>
        <section className="grid flex-1 items-center gap-16 py-20 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#d9f36a]"><span className="size-1.5 rounded-full bg-[#d9f36a]" />Observability for builders</p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.04] tracking-[-0.055em] sm:text-6xl lg:text-7xl">Know what&apos;s happening across everything you build.</h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-[#a8afbd] sm:text-lg">Jerico is taking shape as an open platform for application observability and, over time, the operating system behind your products and businesses.</p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button href="https://github.com/richard-mante/jerico">Explore the project</Button>
              <span className="text-sm text-[#7f8796]">Early development · Open source foundation</span>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-white">Platform status</p><p className="mt-1 text-xs text-[#7f8796]">Foundation milestone</p></div>
              <span className="rounded-full border border-[#d9f36a]/25 bg-[#d9f36a]/10 px-3 py-1 text-xs text-[#d9f36a]">In progress</span>
            </div>
            <div className="my-8 h-px bg-white/10" />
            <div className="space-y-6">
              {foundations.map((item) => <div className="flex gap-4" key={item.number}><span className="pt-0.5 font-mono text-xs text-[#d9f36a]">{item.number}</span><div><h2 className="text-sm font-medium text-white">{item.title}</h2><p className="mt-1.5 text-sm leading-6 text-[#929aaa]">{item.description}</p></div></div>)}
            </div>
            <div className="mt-8 rounded-2xl border border-dashed border-white/15 px-4 py-3 text-xs leading-5 text-[#929aaa]">This is the initial application shell. Live telemetry, authentication, and workspace data are not connected yet.</div>
          </div>
        </section>
        <footer className="flex flex-col gap-2 border-t border-white/10 pt-5 text-xs text-[#737b89] sm:flex-row sm:items-center sm:justify-between"><span>Built for visibility, resilience, and control.</span><span>Jerico · Foundation phase</span></footer>
      </div>
    </main>
  );
}
