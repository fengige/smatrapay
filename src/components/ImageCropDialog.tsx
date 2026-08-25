import { useCallback, useEffect, useRef, useState } from "react";
import { Crop, RotateCcw, X } from "lucide-react";

type Props = {
  file: File;
  /** Output square size in px. */
  size?: number;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
};

const FRAME = 288;

export function ImageCropDialog({ file, size = 512, onCancel, onConfirm }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Scale that makes the image cover the frame at zoom = 1.
  const baseScale = img ? Math.max(FRAME / img.naturalWidth, FRAME / img.naturalHeight) : 1;

  const clamp = useCallback(
    (next: { x: number; y: number }, z: number) => {
      if (!img) return next;
      const w = img.naturalWidth * baseScale * z;
      const h = img.naturalHeight * baseScale * z;
      const maxX = Math.max(0, (w - FRAME) / 2);
      const maxY = Math.max(0, (h - FRAME) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y)),
      };
    },
    [img, baseScale],
  );

  useEffect(() => {
    setOffset((o) => clamp(o, zoom));
  }, [zoom, clamp]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset(clamp({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }, zoom));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const confirm = () => {
    if (!img) return;
    setBusy(true);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setBusy(false);
      return;
    }
    const ratio = size / FRAME;
    const scale = baseScale * zoom * ratio;
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const dx = size / 2 - drawW / 2 + offset.x * ratio;
    const dy = size / 2 - drawH / 2 + offset.y * ratio;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, dx, dy, drawW, drawH);
    canvas.toBlob(
      (blob) => {
        setBusy(false);
        if (blob) onConfirm(blob);
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">Crop profile image</h3>
            <p className="text-xs text-muted-foreground">Drag to reposition, zoom to fit.</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent/10"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex flex-col items-center gap-4 p-5">
          <div
            className="relative touch-none overflow-hidden rounded-full border border-border bg-muted"
            style={{ width: FRAME, height: FRAME }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {src ? (
              <img
                src={src}
                alt="Crop preview"
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                style={{
                  width: img ? img.naturalWidth * baseScale * zoom : FRAME,
                  height: img ? img.naturalHeight * baseScale * zoom : FRAME,
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
              />
            ) : null}
          </div>

          <div className="flex w-full items-center gap-3">
            <span className="text-xs text-muted-foreground">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              aria-label="Zoom"
            />
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent/10"
            >
              <RotateCcw className="size-3.5" /> Reset
            </button>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!img || busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            <Crop className="size-4" />
            {busy ? "Processing…" : "Crop & upload"}
          </button>
        </footer>
      </div>
    </div>
  );
}
