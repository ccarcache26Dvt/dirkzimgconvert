import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  url: z.string().trim().min(1).max(2048).url(),
});

export type ImageSection = {
  title: string;
  images: string[];
};

function normalizeUrl(raw: string, base: string): string | null {
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeFolder(s: string): string {
  const clean = s
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return clean || "general";
}

const IMG_EXT_RE = /\.(?:jpe?g|png|webp|gif|bmp|tiff?|heic|avif)(?:\?|$)/i;

function extractSectionsFromHtml(html: string, baseUrl: string): ImageSection[] {
  const sections: ImageSection[] = [];
  let current: ImageSection = { title: "general", images: [] };
  sections.push(current);
  const seen = new Set<string>();

  const push = (raw: string | undefined) => {
    if (!raw) return;
    const cleaned = raw.trim().replace(/^["']|["']$/g, "");
    if (!cleaned || cleaned.startsWith("data:")) return;
    const abs = normalizeUrl(cleaned, baseUrl);
    if (!abs || !/^https?:\/\//i.test(abs)) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    current.images.push(abs);
  };

  const startSection = (title: string) => {
    const clean = stripTags(title);
    if (!clean) return;
    // Avoid duplicating sections with same title back-to-back
    if (current.images.length === 0 && current.title === "general") {
      current.title = clean;
      return;
    }
    if (current.title.toLowerCase() === clean.toLowerCase()) return;
    current = { title: clean, images: [] };
    sections.push(current);
  };

  const tokenRe = new RegExp(
    [
      // 1: heading level, 2: inner
      String.raw`<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>`,
      // 3: img src
      String.raw`<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']`,
      // 4: img data-src / data-lazy / data-original
      String.raw`<img\b[^>]*?\bdata-(?:src|original|lazy-src|hi-res-src)\s*=\s*["']([^"']+)["']`,
      // 5: srcset list
      String.raw`\bsrcset\s*=\s*["']([^"']+)["']`,
      // 6: css background url
      String.raw`background(?:-image)?\s*:\s*[^;"']*url\(\s*["']?([^"')]+)["']?\s*\)`,
      // 7: og/twitter meta image
      String.raw`<meta\b[^>]*?(?:property|name)\s*=\s*["'](?:og:image|twitter:image)[^"']*["'][^>]*?\bcontent\s*=\s*["']([^"']+)["']`,
      // 8: raw image url (incl. escaped slashes)
      String.raw`https?:\\?\/\\?\/[^\s"'<>()]+?\.(?:jpe?g|png|webp|gif|bmp|tiff?|heic|avif)(?:\?[^\s"'<>()]*)?`,
    ].join("|"),
    "gi",
  );

  for (const m of html.matchAll(tokenRe)) {
    if (m[1] !== undefined) {
      startSection(m[2]);
    } else if (m[3]) {
      push(m[3]);
    } else if (m[4]) {
      push(m[4]);
    } else if (m[5]) {
      for (const cand of m[5].split(",")) {
        const url = cand.trim().split(/\s+/)[0];
        push(url);
      }
    } else if (m[6]) {
      push(m[6]);
    } else if (m[7]) {
      push(m[7]);
    } else if (m[0] && IMG_EXT_RE.test(m[0])) {
      push(m[0].replace(/\\\//g, "/"));
    }
  }

  // Drop empty sections
  return sections.filter((s) => s.images.length > 0);
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

function mergeSections(target: ImageSection[], extra: ImageSection[], fallbackTitle: string) {
  const seenUrls = new Set<string>();
  for (const s of target) for (const u of s.images) seenUrls.add(u);

  for (const s of extra) {
    const title = s.title === "general" ? fallbackTitle : s.title;
    const existing = target.find((t) => t.title.toLowerCase() === title.toLowerCase());
    const bucket = existing ?? { title, images: [] };
    if (!existing) target.push(bucket);
    for (const u of s.images) {
      if (seenUrls.has(u)) continue;
      seenUrls.add(u);
      bucket.images.push(u);
    }
  }
}

export const extractImagesFromUrl = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const first = await fetchHtml(data.url);
      if (!first) {
        return {
          sections: [] as ImageSection[],
          error: "El sitio no respondió o no devolvió HTML",
          pagesScanned: 0,
        };
      }
      const sections = extractSectionsFromHtml(first.html, first.finalUrl);
      let pagesScanned = 1;

      // "Scroll" simulation: try common pagination patterns + rel=next
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
      let idx = 2;
      for (const page of extraPages) {
        if (!page) continue;
        pagesScanned++;
        const extra = extractSectionsFromHtml(page.html, page.finalUrl);
        mergeSections(sections, extra, `pagina_${idx++}`);
      }

      const total = sections.reduce((n, s) => n + s.images.length, 0);
      return {
        sections,
        totalImages: total,
        error: null as string | null,
        pagesScanned,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      return {
        sections: [] as ImageSection[],
        error: `No se pudo obtener el sitio: ${msg}`,
        pagesScanned: 0,
      };
    }
  });

export { sanitizeFolder };
