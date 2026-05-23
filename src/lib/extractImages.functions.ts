import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  url: z.string().trim().min(1).max(2048).url(),
});

function normalizeUrl(raw: string, base: string): string | null {
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

function extractImageUrls(html: string, baseUrl: string): string[] {
  const found = new Set<string>();

  const push = (raw: string | undefined) => {
    if (!raw) return;
    const cleaned = raw.trim().replace(/^["']|["']$/g, "");
    if (!cleaned || cleaned.startsWith("data:")) return;
    const abs = normalizeUrl(cleaned, baseUrl);
    if (abs && /^https?:\/\//i.test(abs)) found.add(abs);
  };

  // <img src="...">
  for (const m of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) push(m[1]);
  // <img data-src="..."> (lazy loading)
  for (const m of html.matchAll(/<img\b[^>]*?\bdata-src\s*=\s*["']([^"']+)["']/gi)) push(m[1]);
  for (const m of html.matchAll(/\bdata-(?:original|lazy-src|hi-res-src)\s*=\s*["']([^"']+)["']/gi)) push(m[1]);

  // srcset (img / source) — take first URL of each candidate
  for (const m of html.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) {
    const list = m[1].split(",");
    for (const cand of list) {
      const url = cand.trim().split(/\s+/)[0];
      push(url);
    }
  }

  // <a href="...image-ext">
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"']+\.(?:jpe?g|png|webp|gif|bmp|tiff?|heic|avif))(?:\?[^"']*)?["']/gi)) {
    push(m[1]);
  }

  // og:image / twitter:image meta tags
  for (const m of html.matchAll(/<meta\b[^>]*?(?:property|name)\s*=\s*["'](?:og:image|twitter:image)[^"']*["'][^>]*?\bcontent\s*=\s*["']([^"']+)["']/gi)) {
    push(m[1]);
  }

  // background-image: url(...)
  for (const m of html.matchAll(/background(?:-image)?\s*:\s*[^;"']*url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    push(m[1]);
  }

  return Array.from(found);
}

export const extractImagesFromUrl = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const res = await fetch(data.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; ImageConverterRight/1.0; +https://dirkzimgconvert.lovable.app)",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });
      if (!res.ok) {
        return { images: [] as string[], error: `El sitio respondió ${res.status} ${res.statusText}` };
      }
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("html")) {
        return { images: [] as string[], error: `Tipo de contenido no soportado: ${contentType}` };
      }
      const html = await res.text();
      const finalUrl = res.url || data.url;
      const images = extractImageUrls(html, finalUrl);
      return { images, error: null as string | null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      return { images: [] as string[], error: `No se pudo obtener el sitio: ${msg}` };
    }
  });
