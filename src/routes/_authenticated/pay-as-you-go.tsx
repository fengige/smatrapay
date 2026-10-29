import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { PaygGrid } from "@/components/payg/PaygCatalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { listAdminPaygProducts, listAdminPaygApplications, saveAdminPaygProduct, reviewPaygProduct, reviewPaygApplication } from "@/lib/payg-approval.functions";
import { paygProductSchema, type PaygProduct } from "@/lib/payg";

const description = "Review vendor products and resident Pay-as-you-go applications.";
export const Route = createFileRoute("/_authenticated/pay-as-you-go")({
  head: () => ({ meta: [{ title: "Pay-as-you-go Management · SmatraPay" }, { name: "description", content: description }, { property: "og:title", content: "Pay-as-you-go Management · SmatraPay" }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: () => checkRoleAccess({ data: { role: "admin" } }), component: Page,
});

function Page() {
  const readProducts = useServerFn(listAdminPaygProducts);
  const readApplications = useServerFn(listAdminPaygApplications);
  const save = useServerFn(saveAdminPaygProduct);
  const reviewProduct = useServerFn(reviewPaygProduct);
  const reviewApplication = useServerFn(reviewPaygApplication);
  const products = useQuery({ queryKey: ["admin-payg-products"], queryFn: () => readProducts() });
  const applications = useQuery({ queryKey: ["admin-payg-applications"], queryFn: () => readApplications() });
  const [vendor, setVendor] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<PaygProduct | null>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{ id: string; title: string; kind: "product" | "application"; action: "approved" | "declined" | "deleted" } | null>(null);
  const [note, setNote] = useState("");
  const vendors = [...new Map((products.data ?? []).map(p => [p.vendor_id, p.vendor_name ?? p.vendor_id])).entries()];
  const matches = (name: string, vendorId: string, state: string) => (!vendor || vendor === vendorId) && (!status || state === status) && name.toLowerCase().includes(search.toLowerCase());
  const chooseReview = (r: NonNullable<typeof review>) => { setReview(r); setNote(""); };
  const confirmReview = async () => {
    if (!review || busy) return;
    setBusy(true);
    try {
      if (review.kind === "product") await reviewProduct({ data: { id: review.id, action: review.action, note } });
      else if (review.action !== "deleted") await reviewApplication({ data: { id: review.id, status: review.action, note } });
      await Promise.all([products.refetch(), applications.refetch()]); setReview(null); toast.success("Review saved");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const saveEdit = async () => {
    if (!editing || busy) return;
    const parsed = paygProductSchema.safeParse(editing);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Check product details"); return; }
    setBusy(true);
    try { await save({ data: parsed.data }); await products.refetch(); setEditing(null); toast.success("Product saved; approve it when ready"); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return <DashboardShell access={Route.useLoaderData()} title="Pay-as-you-go Management" description={description}>
    <div className="mb-5 flex flex-wrap gap-3"><Input aria-label="Search products or applicants" placeholder="Search products or applicants" className="w-full sm:w-64" value={search} onChange={e => setSearch(e.target.value)} />
      <select aria-label="Vendor" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={vendor} onChange={e => setVendor(e.target.value)}><option value="">All vendors</option>{vendors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <select aria-label="Approval status" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{["pending", "approved", "declined"].map(s => <option key={s}>{s}</option>)}</select>
    </div>
    <Tabs defaultValue="products"><TabsList><TabsTrigger value="products">Vendor products</TabsTrigger><TabsTrigger value="applications">Resident applications</TabsTrigger></TabsList>
      <TabsContent value="products">{products.isPending ? <p role="status">Loading products…</p> : products.isError ? <Button variant="outline" onClick={() => void products.refetch()}>Retry loading products</Button> : <PaygGrid products={(products.data ?? []).filter(p => matches(p.name, p.vendor_id, p.approval_status ?? "pending"))} empty="No matching products." actions={p => <div className="space-y-2"><p className="text-sm capitalize">{p.approval_status}</p>{p.review_note && <p className="text-xs text-muted-foreground">{p.review_note}</p>}<div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button>{p.approval_status !== "approved" && <Button size="sm" onClick={() => chooseReview({ id: p.id, title: p.name, kind: "product", action: "approved" })}>Approve</Button>}{p.approval_status !== "declined" && <Button size="sm" variant="outline" onClick={() => chooseReview({ id: p.id, title: p.name, kind: "product", action: "declined" })}>Decline</Button>}<Button size="sm" variant="ghost" className="text-destructive" onClick={() => chooseReview({ id: p.id, title: p.name, kind: "product", action: "deleted" })}>Delete</Button></div></div>} />}</TabsContent>
      <TabsContent value="applications">{applications.isPending ? <p role="status">Loading applications…</p> : applications.isError ? <Button variant="outline" onClick={() => void applications.refetch()}>Retry loading applications</Button> : <div className="grid gap-4 md:grid-cols-2">{applications.data.filter(a => matches(`${a.full_name} ${a.product_name}`, a.vendor_id, a.status)).map(a => <article key={a.id} className="space-y-2 rounded-lg border border-border p-4"><h3 className="font-semibold">{a.full_name} · {a.product_name}</h3><p className="text-xs text-muted-foreground">{vendors.find(([id]) => id === a.vendor_id)?.[1] ?? "Vendor"} · {new Date(a.created_at).toLocaleDateString()}</p><p className="text-sm capitalize">{a.status}</p><p className="text-sm">{a.phone}</p><p className="whitespace-pre-wrap text-sm">{a.delivery_address}</p>{a.notes && <p className="text-sm">{a.notes}</p>}{a.review_note && <p className="text-sm">Review: {a.review_note}</p>}{a.status === "pending" && <div className="flex gap-2">{(["approved", "declined"] as const).map(action => <Button key={action} variant={action === "approved" ? "default" : "outline"} onClick={() => chooseReview({ id: a.id, title: `${a.full_name} · ${a.product_name}`, kind: "application", action })}>{action === "approved" ? "Approve application" : "Decline"}</Button>)}</div>}</article>)}{!applications.data.length && <p className="text-muted-foreground">No applications yet.</p>}</div>}</TabsContent>
    </Tabs>
    <Dialog open={Boolean(review)} onOpenChange={v => !v && !busy && setReview(null)}><DialogContent><DialogHeader><DialogTitle>{review?.action === "deleted" ? "Delete" : review?.action === "approved" ? "Approve" : "Decline"} {review?.title}</DialogTitle></DialogHeader><p className="text-sm">{review?.action === "deleted" ? "Remove this product from the catalogue. Existing applications, plans and payment history are retained." : review?.kind === "application" ? "Approval creates the resident's payment plan. No payment is charged now." : "Only approved, active products appear in the resident catalogue."}</p><Label htmlFor="payg-review-note">Review note</Label><Textarea id="payg-review-note" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>Cancel</Button><Button disabled={busy} onClick={() => void confirmReview()}>{busy ? "Saving…" : "Confirm"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(editing)} onOpenChange={v => !v && !busy && setEditing(null)}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Edit vendor product</DialogTitle></DialogHeader>{editing && <div className="space-y-3"><Label htmlFor="edit-payg-name">Product name</Label><Input id="edit-payg-name" maxLength={120} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /><Label htmlFor="edit-payg-description">Description</Label><Textarea id="edit-payg-description" maxLength={1000} value={editing.description ?? ""} onChange={e => setEditing({ ...editing, description: e.target.value })} />{(["price", "down_payment", "instalment_amount", "instalment_count"] as const).map(key => <div key={key}><Label htmlFor={`edit-${key}`}>{key.replaceAll("_", " ")}{key !== "instalment_count" ? " (KES)" : ""}</Label><Input id={`edit-${key}`} type="number" min="0" step={key === "instalment_count" ? "1" : "0.01"} value={editing[key] ?? ""} onChange={e => setEditing({ ...editing, [key]: e.target.value === "" ? null : Number(e.target.value) })} /></div>)}<Label htmlFor="edit-payg-frequency">Frequency</Label><select id="edit-payg-frequency" className="h-10 w-full rounded-md border border-input bg-background px-3" value={editing.instalment_frequency ?? ""} onChange={e => setEditing({ ...editing, instalment_frequency: e.target.value || null })}><option value="">Not set</option>{["daily", "weekly", "monthly"].map(f => <option key={f}>{f}</option>)}</select></div>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button><Button disabled={busy} onClick={() => void saveEdit()}>{busy ? "Saving…" : "Save changes"}</Button></DialogFooter></DialogContent></Dialog>
  </DashboardShell>;
}