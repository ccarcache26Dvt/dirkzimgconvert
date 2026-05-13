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

async function decodeTiff(file: File): Promise<Blob> {
  const UTIF = (await import("utif")).default;
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  if (!ifds.length) throw new Error("TIFF inválido");
  UTIF.decodeImage(buf, ifds[0]);
  const rgba = UTIF.toRGBA8(ifds[0]);
  const w = ifds[0].width;
  const h = ifds[0].height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no soportado");
  const imgData = ctx.createImageData(w, h);
  imgData.data.set(rgba);
  ctx.putImageData(imgData, 0, 0);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("TIFF decode failed"))), "image/png");
  });
}

function isHeic(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "heic" || ext === "heif" || file.type === "image/heic" || file.type === "image/heif";
}

function isTiff(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "tif" || ext === "tiff" || file.type === "image/tiff";
}

async function decodeToBlob(file: File): Promise<Blob> {
  if (isHeic(file)) return decodeHeic(file);
  if (isTiff(file)) return decodeTiff(file);
  return file;
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
  const sourceBlob: Blob = await decodeToBlob(file);

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

  const baseName = file.name.replace(/\.[^.]+$/, "");

  let blob: Blob;
  if (format === "tiff") {
    // Real TIFF encoding via UTIF (canvas no soporta TIFF nativamente)
    const UTIF = (await import("utif")).default;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const tiffBuffer = UTIF.encodeImage(
      new Uint8Array(imgData.data.buffer, imgData.data.byteOffset, imgData.data.byteLength),
      canvas.width,
      canvas.height,
    );
    blob = new Blob([tiffBuffer], { type: "image/tiff" });
  } else {
    const targetMime = mimeFor(format);
    blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Conversión fallida"))),
        targetMime,
        0.92,
      );
    });
  }

  return { blob, filename: `${baseName}.${extFor(format)}` };
}

export async function compressImage(
  file: File,
  quality: number,
  maxWidth?: number,
): Promise<{ blob: Blob; filename: string; originalSize: number; newSize: number }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  let sourceBlob: Blob = file;

  if (ext === "heic" || ext === "heif" || file.type === "image/heic" || file.type === "image/heif") {
    sourceBlob = await decodeHeic(file);
  }

  const img = await blobToImage(sourceBlob);
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (maxWidth && w > maxWidth) {
    h = Math.round((h * maxWidth) / w);
    w = maxWidth;
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no soportado");

  // Preserve PNG transparency, otherwise output JPEG for max compression
  const isPng = ext === "png" || file.type === "image/png";
  const outMime = isPng ? "image/webp" : "image/jpeg";
  const outExt = isPng ? "webp" : "jpg";

  if (!isPng) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Compresión fallida"))),
      outMime,
      Math.min(1, Math.max(0.1, quality)),
    );
  });

  const baseName = file.name.replace(/\.[^.]+$/, "");
  return {
    blob,
    filename: `${baseName}_comprimido.${outExt}`,
    originalSize: file.size,
    newSize: blob.size,
  };
}
