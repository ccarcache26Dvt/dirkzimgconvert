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

  // URLs embedded in <script> JSON blobs (SPA / infinite-scroll content)
  for (const m of html.matchAll(
    /https?:\\?\/\\?\/[^\s"'<>()]+?\.(?:jpe?g|png|webp|gif|bmp|tiff?|heic|avif)(?:\?[^\s"'<>()]*)?/gi,
  )) {
    push(m[0].replace(/\\\//g, "/"));
  }

  return Array.from(found);
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ImageConverterRight/1.0; +https://dirkzimgconvert.lovable.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html")) return null;
    return { html: await res.text(), finalUrl: res.url || url };
  } catch {
    return null;
  }
}

export const extractImagesFromUrl = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const first = await fetchHtml(data.url);
      if (!first) {
        return {
          images: [] as string[],
          error: "El sitio no respondió o no devolvió HTML",
          pagesScanned: 0,
        };
      }
      const allImages = new Set<string>(extractImageUrls(first.html, first.finalUrl));
      let pagesScanned = 1;

      // "Scroll" simulation: try common pagination patterns to surface more images
      const baseUrl = new URL(first.finalUrl);
      const candidates = new Set<string>();
      for (let p = 2; p <= 4; p++) {
        const u1 = new URL(baseUrl.toString());
        u1.searchParams.set("page", String(p));
        candidates.add(u1.toString());
        const u2 = new URL(baseUrl.toString());
        u2.searchParams.set("p", String(p));
        candidates.add(u2.toString());
      }
      // Follow <link rel="next"> if present
      const nextMatch = first.html.match(
        /<link\b[^>]*?\brel\s*=\s*["']next["'][^>]*?\bhref\s*=\s*["']([^"']+)["']/i,
      );
      if (nextMatch) {
        const abs = normalizeUrl(nextMatch[1], first.finalUrl);
        if (abs) candidates.add(abs);
      }

      const extraPages = await Promise.all(
        Array.from(candidates).slice(0, 4).map((u) => fetchHtml(u)),
      );
      for (const page of extraPages) {
        if (!page) continue;
        pagesScanned++;
        for (const img of extractImageUrls(page.html, page.finalUrl)) allImages.add(img);
      }

      return { images: Array.from(allImages), error: null as string | null, pagesScanned };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      return {
        images: [] as string[],
        error: `No se pudo obtener el sitio: ${msg}`,
        pagesScanned: 0,
      };
    }
  });
