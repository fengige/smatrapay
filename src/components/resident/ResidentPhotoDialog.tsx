import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { validateProfileImage } from "@/lib/image-upload";
import { saveResidentPhoto, removeResidentPhoto } from "@/lib/resident-profile.functions";

export function ResidentPhotoDialog({ open, setOpen, photo, onChange }: { open: boolean; setOpen: (v: boolean) => void; photo: string | null; onChange: () => Promise<unknown> }) {
  const save = useServerFn(saveResidentPhoto); const remove = useServerFn(removeResidentPhoto);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<string | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (!file) { setPreview(null); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  const close = () => { setFile(null); setError(""); setConfirm(false); setOpen(false); };
  return <Dialog open={open} onOpenChange={v => { if (!busy) { if (!v) close(); else setOpen(true); } }}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Profile Photo</DialogTitle></DialogHeader>
    {preview || photo ? <img src={preview ?? photo ?? ""} alt="Profile photo preview" className="mx-auto size-40 rounded-full object-cover" /> : <div className="mx-auto flex size-40 items-center justify-center rounded-full bg-primary/10"><Camera className="size-12 text-primary" /></div>}
    <input ref={input} type="file" className="sr-only" aria-label="Select profile photo" accept="image/jpeg,image/png,image/webp" onChange={async e => { const selected = e.target.files?.[0]; if (!selected) return; setError(""); const checked = await validateProfileImage(selected); if (!checked.ok) { setError(checked.error); return; } setFile(selected); setConfirm(false); }} />
    <p className="text-xs text-muted-foreground">JPEG, PNG or WebP · up to 5 MB · 100–4096 pixels</p>
    <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}><Camera />Choose Photo</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {busy && <div role="progressbar" aria-label="Saving profile photo" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Uploading and saving…</div>}
    {confirm && <p className="text-sm">Remove your profile photo and restore the default avatar?</p>}
    <div className="flex flex-wrap gap-2"><Button disabled={busy || (!file && !confirm)} onClick={async () => { setBusy(true); setError(""); try { if (confirm) await remove(); else if (file) { const data = new FormData(); data.set("photo", file); await save({ data }); } await onChange(); toast.success(confirm ? "Profile photo removed" : "Profile photo saved"); close(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>{confirm ? "Confirm Removal" : "Save Photo"}</Button><Button variant="outline" disabled={busy} onClick={close}>Cancel</Button>{photo && !confirm && <Button variant="ghost" disabled={busy} onClick={() => { setConfirm(true); setFile(null); }}><Trash2 />Remove Photo</Button>}</div>
  </DialogContent></Dialog>;
}