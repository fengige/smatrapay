import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { PaygGrid, PaygHowItWorks } from "@/components/payg/PaygCatalog";
import { deleteVendorPaygProduct, listVendorPaygProducts, saveVendorPaygProduct } from "@/lib/payg.functions";
import { paygProductSchema, PAYG_FREQUENCIES, type PaygProduct } from "@/lib/payg";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const META = "Create and manage the Pay-as-you-go products you offer.";
export const Route = createFileRoute("/_authenticated/vendor/pay-as-you-go")({
  head: () => ({
    meta: [
      { title: "Pay-as-you-go · Vendor · SmatraPay" },
      { name: "description", content: META },
      { property: "og:title", content: "Pay-as-you-go · Vendor · SmatraPay" },
      { property: "og:description", content: META },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: () => checkRoleAccess({ data: { role: "vendor" } }),
  component: Page,
  errorComponent: ({ error }) => <p className="p-8 text-sm text-destructive">{(error as Error).message}</p>,
});

type Form = { id?: string; name: string; description: string; image_path: string | null; price: string; down_payment: string; instalment_amount: string; instalment_frequency: string; instalment_count: string; is_active: boolean };
const blank: Form = { name: "", description: "", image_path: null, price: "", down_payment: "", instalment_amount: "", instalment_frequency: "", instalment_count: "", is_active: true };
const num = (s: string) => (s.trim() === "" ? null : Number(s));

function Page() {
  const access = Route.useLoaderData();
  const qc = useQueryClient();
  const list = useServerFn(listVendorPaygProducts);
  const save = useServerFn(saveVendorPaygProduct);
  const del = useServerFn(deleteVendorPaygProduct);
  const q = useQuery({ queryKey: ["vendor-payg"], queryFn: () => list() });
  const [form, setForm] = useState<Form | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const open = (p?: PaygProduct) => {
    setErrors({}); setFile(null);
    setForm(p ? { id: p.id, name: p.name, description: p.description ?? "", image_path: p.image_path, price: p.price?.toString() ?? "", down_payment: p.down_payment?.toString() ?? "", instalment_amount: p.instalment_amount?.toString() ?? "", instalment_frequency: p.instalment_frequency ?? "", instalment_count: p.instalment_count?.toString() ?? "", is_active: p.is_active } : blank);
  };

  const submit = async () => {
    if (!form || busy) return;
    const payload = { id: form.id, name: form.name, description: form.description || null, image_path: form.image_path, price: num(form.price), down_payment: num(form.down_payment), instalment_amount: num(form.instalment_amount), instalment_frequency: (form.instalment_frequency || null) as any, instalment_count: num(form.instalment_count), is_active: form.is_active };
    const check = paygProductSchema.safeParse(payload);
    if (!check.success) { setErrors(Object.fromEntries(check.error.issues.map((i) => [String(i.path[0]), i.message]))); return; }
    if (file && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)) { setErrors({ image: "Use a JPG, PNG or WebP image up to 5 MB" }); return; }
    setBusy(true);
    try {
      if (file) {
        const path = `${(await supabase.auth.getUser()).data.user?.id}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
        const { error } = await supabase.storage.from("payg-products").upload(path, file, { contentType: file.type });
        if (error) throw new Error("Image upload failed");
        payload.image_path = path;
      }
      await save({ data: payload });
      toast.success(form.id ? "Product updated" : "Product added");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["vendor-payg"] });
    } catch (e) {
      toast.error((e as Error).message || "Could not save the product");
    } finally { setBusy(false); }
  };

  const remove = async (p: PaygProduct) => {
    if (!confirm(`Delete "${p.name}"? Residents will no longer see it.`)) return;
    try { await del({ data: { id: p.id } }); toast.success("Product deleted"); qc.invalidateQueries({ queryKey: ["vendor-payg"] }); }
    catch { toast.error("Could not delete the product"); }
  };

  const field = (k: keyof Form, label: string, type = "text") => (
    <div className="space-y-1">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} type={type} min={type === "number" ? 0 : undefined} step={type === "number" ? "0.01" : undefined} value={String(form?.[k] ?? "")} onChange={(e) => setForm((f) => f && { ...f, [k]: e.target.value })} />
      {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
    </div>
  );

  return (
    <DashboardShell access={access} title="Pay-as-you-go" description={META}>
      <div className="space-y-6">
        <PaygHowItWorks />
        <div className="flex justify-end"><Button onClick={() => open()}><Plus className="mr-1 h-4 w-4" />Add Pay-as-you-go Product</Button></div>
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading products…</p>
          : q.isError ? <p className="text-sm text-destructive">Could not load products.</p>
          : <PaygGrid products={q.data ?? []} empty="You haven't added any Pay-as-you-go products yet."
              actions={(p) => (<><Button size="sm" variant="outline" onClick={() => open(p)}>Edit</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(p)}>Delete</Button></>)} />}
      </div>
      <Dialog open={!!form} onOpenChange={(o) => !o && !busy && setForm(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form?.id ? "Edit product" : "Add Pay-as-you-go Product"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              {field("name", "Product name *")}
              <div className="space-y-1">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="image">Image {form.image_path && !file ? "(current image kept)" : ""}</Label>
                <Input id="image" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                {errors.image && <p className="text-xs text-destructive">{errors.image}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {field("price", "Price (KES)", "number")}
                {field("down_payment", "Down payment (KES)", "number")}
                {field("instalment_amount", "Instalment (KES)", "number")}
                <div className="space-y-1">
                  <Label htmlFor="freq">Frequency</Label>
                  <select id="freq" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.instalment_frequency} onChange={(e) => setForm({ ...form, instalment_frequency: e.target.value })}>
                    <option value="">—</option>
                    {PAYG_FREQUENCIES.map((f) => <option key={f} value={f}>{f[0].toUpperCase() + f.slice(1)}</option>)}
                  </select>
                  {errors.instalment_frequency && <p className="text-xs text-destructive">{errors.instalment_frequency}</p>}
                </div>
                {field("instalment_count", "Number of instalments", "number")}
              </div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />Visible to residents</label>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setForm(null)} disabled={busy}>Cancel</Button><Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
