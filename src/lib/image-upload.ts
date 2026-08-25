export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MIN_IMAGE_DIMENSION = 100;
export const MAX_IMAGE_DIMENSION = 4096;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extensionForType(type: string): string {
  return EXT_BY_TYPE[type] ?? "jpg";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type ImageValidationResult =
  | { ok: true; width: number; height: number }
  | { ok: false; error: string };

function readDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This file could not be read as an image. It may be corrupted."));
    };
    img.src = url;
  });
}

export async function validateProfileImage(file: File): Promise<ImageValidationResult> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return {
      ok: false,
      error: `Unsupported file type${file.type ? ` (${file.type})` : ""}. Use JPG, PNG or WebP.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, error: "This file is empty. Choose a different image." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `Image is ${formatBytes(file.size)} — the maximum allowed size is ${formatBytes(MAX_IMAGE_BYTES)}.`,
    };
  }

  let dimensions: { width: number; height: number };
  try {
    dimensions = await readDimensions(file);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { width, height } = dimensions;
  if (width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION) {
    return {
      ok: false,
      error: `Image is ${width}×${height}px — it must be at least ${MIN_IMAGE_DIMENSION}×${MIN_IMAGE_DIMENSION}px.`,
    };
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    return {
      ok: false,
      error: `Image is ${width}×${height}px — it must be no larger than ${MAX_IMAGE_DIMENSION}×${MAX_IMAGE_DIMENSION}px.`,
    };
  }

  return { ok: true, width, height };
}
