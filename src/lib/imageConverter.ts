export type TargetFormat = "jpg" | "png" | "webp" | "tiff";

export const VIDEO_EXTENSIONS = [
  "mp4", "mov", "avi", "mkv", "webm", "flv", "wmv", "m4v", "mpg", "mpeg", "3gp",
];

export const VIDEO_MIMES = ["video/"];

export const IMAGE_EXTENSIONS = [
  "jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff", "tif", "heic", "heif", "avif",
];

export function isVideoFile(file: File): boolean {
  if (VIDEO_MIMES.some((m) => file.type.startsWith(m))) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.includes(ext);
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.includes(ext);
}

function mimeFor(format: TargetFormat): string {
  switch (format) {
    case "jpg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "tiff":
      return "image/tiff";
  }
}

function extFor(format: TargetFormat): string {
  return format === "jpg" ? "jpg" : format;
}

async function decodeHeic(file: File): Promise<Blob> {
  if (typeof window === "undefined") {
    throw new Error("La conversión HEIC solo está disponible en el navegador");
  }
  const { default: heic2any } = await import("heic2any");
  const result = await heic2any({ blob: file, toType: "image/png" });
  return Array.isArray(result) ? result[0] : result;
}

async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("No se pudo decodificar la imagen"));
      img.src = url;
    });
    return img;
  } finally {
    // Revoke later (after draw)
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function convertImage(
  file: File,
  format: TargetFormat,
): Promise<{ blob: Blob; filename: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  let sourceBlob: Blob = file;

  if (ext === "heic" || ext === "heif" || file.type === "image/heic" || file.type === "image/heif") {
    sourceBlob = await decodeHeic(file);
  }

  const img = await blobToImage(sourceBlob);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no soportado");

  if (format === "jpg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0);

  const targetMime = mimeFor(format);
  // Browsers may not support tiff encoding via canvas; fallback to png
  const useMime =
    format === "tiff" ? "image/png" : targetMime;

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Conversión fallida"))),
      useMime,
      0.92,
    );
  });

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const finalExt = format === "tiff" ? "png" : extFor(format);
  return { blob, filename: `${baseName}.${finalExt}` };
}
