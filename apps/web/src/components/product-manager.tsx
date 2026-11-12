"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "../lib/auth-client";
const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
type Product = { id: string; name: string; slug: string; description: string | null; websiteUrl: string | null; status: "active" | "archived" };
function slugify(value: string) { return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "product"; }
export function ProductManager() {
  const { data: session, isPending } = authClient.useSession();
  const organizationId = session?.session.activeOrganizationId ?? "";
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState(""); const [slug, setSlug] = useState(""); const [description, setDescription] = useState(""); const [websiteUrl, setWebsiteUrl] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  async function request(path: string, init?: RequestInit) { const response = await fetch(apiBase + path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(init?.body ? { "Content-Type": "application/json" } : {}), "X-Jerico-Organization-Id": organizationId } }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "The request could not be completed."); return payload.data; }
  async function refresh() { if (!organizationId) return; const data = await request("/api/v1/products"); setProducts(data as Product[]); }
  useEffect(() => { if (organizationId) void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load products.")); }, [organizationId]);
  function edit(product: Product) { setEditingId(product.id); setName(product.name); setSlug(product.slug); setDescription(product.description ?? ""); setWebsiteUrl(product.websiteUrl ?? ""); }
  function reset() { setEditingId(null); setName(""); setSlug(""); setDescription(""); setWebsiteUrl(""); }
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { const path = editingId ? `/api/v1/products/${encodeURIComponent(editingId)}` : "/api/v1/products"; const body = { name: name.trim(), slug: slugify(slug || name), ...(editingId ? { description: description.trim() || null, websiteUrl: websiteUrl.trim() || null } : { ...(description.trim() ? { description: description.trim() } : {}), ...(websiteUrl.trim() ? { websiteUrl: websiteUrl.trim() } : {}) }) }; await request(path, { method: editingId ? "PATCH" : "POST", body: JSON.stringify(body) }); setNotice(editingId ? "Product updated." : "Product created."); reset(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save product."); } finally { setBusy(false); }
  }
  async function toggleArchive(product: Product) { const status = product.status === "active" ? "archived" : "active"; setBusy(true); setError(""); setNotice("");
    try { await request(`/api/v1/products/${encodeURIComponent(product.id)}`, { method: "PATCH", body: JSON.stringify({ status }) }); setNotice(status === "archived" ? "Product archived." : "Product restored."); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update product."); } finally { setBusy(false); }
  }
  if (isPending) return <main className="min-h-screen bg-[#090b10] p-8 text-sm text-[#929aaa]">Loading products…</main>;
  if (!session) return <main className="min-h-screen bg-[#090b10] p-8 text-sm text-[#929aaa]">Sign in to manage products.</main>;
  return <main className="min-h-screen bg-[#090b10] px-5 py-8 text-[#f5f7fb] sm:px-10"><div className="mx-auto max-w-5xl">
    <header className="border-b border-white/10 pb-6"><Link href="/dashboard" className="text-sm text-[#929aaa] hover:text-white">← Workspace</Link><p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#d9f36a]">Portfolio</p><h1 className="mt-2 text-3xl font-semibold">Products</h1><p className="mt-2 text-sm text-[#929aaa]">Group related projects under a product or application.</p></header>
    {error && <p role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">{error}</p>}{notice && <p role="status" className="mt-5 rounded-xl border border-[#d9f36a]/20 bg-[#d9f36a]/5 px-4 py-3 text-sm text-[#d9f36a]">{notice}</p>}
    <div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
      <form onSubmit={save} className="h-fit rounded-2xl border border-white/10 bg-white/[0.035] p-6"><h2 className="font-semibold">{editingId ? "Edit product" : "Add a product"}</h2>
        <label className="mt-5 block space-y-2 text-sm"><span className="text-[#a8afbd]">Name</span><input required minLength={2} maxLength={80} value={name} onChange={(event) => { setName(event.target.value); if (!slug) setSlug(slugify(event.target.value)); }} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3" /></label>
        <label className="mt-4 block space-y-2 text-sm"><span className="text-[#a8afbd]">Slug</span><input required minLength={2} maxLength={60} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(event) => setSlug(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3" /></label>
        <label className="mt-4 block space-y-2 text-sm"><span className="text-[#a8afbd]">Description</span><textarea maxLength={500} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3" /></label>
        <label className="mt-4 block space-y-2 text-sm"><span className="text-[#a8afbd]">Website URL</span><input type="url" maxLength={2048} value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://example.com" className="w-full rounded-xl border border-white/10 bg-[#0c1018] px-4 py-3" /></label>
        <div className="mt-5 flex gap-2"><button disabled={busy} className="flex-1 rounded-xl bg-[#d9f36a] px-4 py-3 text-sm font-semibold text-[#15190b] disabled:opacity-50">{busy ? "Saving…" : editingId ? "Save changes" : "Create product"}</button>{editingId && <button type="button" onClick={reset} className="rounded-xl border border-white/15 px-4 py-3 text-sm">Cancel</button>}</div>
      </form>
      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Your products</h2><p className="mt-1 text-xs text-[#737b89]">Products in the active organization</p></div><span className="text-xs text-[#929aaa]">{products.length} total</span></div><div className="mt-4 divide-y divide-white/10">{products.map((product) => <div key={product.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><div className="flex items-center gap-2"><p className="text-sm font-medium">{product.name}</p><span className={`rounded-full px-2 py-1 text-[10px] ${product.status === "active" ? "bg-[#d9f36a]/10 text-[#d9f36a]" : "bg-amber-300/10 text-amber-100"}`}>{product.status}</span></div><p className="mt-1 text-xs text-[#737b89]">{product.slug}{product.websiteUrl ? ` · ${product.websiteUrl}` : ""}</p>{product.description && <p className="mt-1 max-w-lg text-xs text-[#929aaa]">{product.description}</p>}</div><div className="flex gap-2"><button disabled={busy} onClick={() => edit(product)} className="rounded-lg border border-white/15 px-3 py-2 text-xs">Edit</button><button disabled={busy} onClick={() => void toggleArchive(product)} className="rounded-lg border border-white/15 px-3 py-2 text-xs">{product.status === "active" ? "Archive" : "Restore"}</button></div></div>)}{!products.length && <p className="py-8 text-center text-sm text-[#737b89]">No products yet. Add a product to group its projects.</p>}</div></section>
    </div>
  </div></main>;
}
