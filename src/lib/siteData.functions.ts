import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  id: z.string().trim().max(120).optional(),
  url: z.string().trim().max(2048).optional(),
});

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type SiteData = { [k: string]: Json };

export type SiteDataResult = {
  source: "api" | "scrape" | null;
  data: SiteData | null;
  error: string | null;
  notes: string[];
};

function abs(raw: string, base: string): string | null {
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

function uniq(list: string[]): string[] {
  return Array.from(new Set(list.filter(Boolean)));
}

function metaContent(html: string, key: string): string {
  const re = new RegExp(
    `<meta\\b[^>]*?(?:property|name)\\s*=\\s*["']${key}["'][^>]*?\\bcontent\\s*=\\s*["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re);
  return m ? decode(m[1]) : "";
}

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif|bmp|tiff?)(\?|#|$)/i;

export function collectImages(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const push = (raw?: string) => {
    if (!raw) return;
    const cleaned = raw.trim().replace(/\\\//g, "/").replace(/&amp;/gi, "&");
    if (!cleaned || cleaned.startsWith("data:")) return;
    const u = abs(cleaned, baseUrl);
    if (!u || !/^https?:/i.test(u)) return;
    if (/\.svg(\?|#|$)/i.test(u)) return;
    out.push(u);
  };

  // src / lazy attributes
  for (const m of html.matchAll(
    /\b(?:src|data-src|data-lazy-src|data-original|data-image|data-bg|data-large|data-full)\s*=\s*["']([^"']+)["']/gi,
  )) {
    if (IMG_EXT.test(m[1]) || /\/image|\/img|cdn|uploads/i.test(m[1])) push(m[1]);
  }
  // srcset (take every candidate)
  for (const m of html.matchAll(/\b(?:srcset|data-srcset)\s*=\s*["']([^"']+)["']/gi)) {
    for (const part of m[1].split(",")) push(part.trim().split(/\s+/)[0]);
  }
  // css background-image
  for (const m of html.matchAll(/url\(\s*["']?([^"')]+\.(?:jpe?g|png|webp|gif|avif))["']?\s*\)/gi)) {
    push(m[1]);
  }
  // links to images + urls inside JSON/scripts
  for (const m of html.matchAll(/https?:\\?\/\\?\/[^\s"'<>()\\]+\.(?:jpe?g|png|webp|gif|avif)/gi)) {
    push(m[0]);
  }
  return uniq(out);
}

function sectionsFromHtml(html: string, baseUrl: string) {
  const parts: { title: string; images: string[]; text: string }[] = [];
  const re = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let last = 0;
  let title = "general";
  let m: RegExpExecArray | null;
  const push = (t: string, chunk: string) => {
    const imgs = collectImages(chunk, baseUrl);
    const text = uniq(
      Array.from(chunk.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
        .map((x) => decode(x[1]))
        .filter((x) => x.length > 60),
    ).join(" ");
    if (imgs.length || text) parts.push({ title: t, images: imgs, text });
  };
  while ((m = re.exec(html))) {
    push(title, html.slice(last, m.index));
    title = decode(m[2]).slice(0, 80) || "general";
    last = m.index + m[0].length;
  }
  push(title, html.slice(last));
  return parts;
}

function afterHeading(html: string, rx: RegExp): string {
  const m = html.match(
    new RegExp(`<h[1-4][^>]*>\\s*[^<]*${rx.source}[^<]*<\\/h[1-4]>([\\s\\S]{0,1200})`, "i"),
  );
  if (!m) return "";
  const p = m[1].match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  return p ? decode(p[1]) : "";
}

function buildFromHtml(html: string, baseUrl: string, allImages?: string[]) {
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").split(/[|\-–]/)[0]);
  const name = metaContent(html, "og:site_name") || title || new URL(baseUrl).hostname;

  const favicon =
    (html.match(/<link\b[^>]*?rel\s*=\s*["'][^"']*icon[^"']*["'][^>]*?href\s*=\s*["']([^"']+)["']/i)?.[1] ??
      "") || "";

  const images = allImages?.length ? uniq(allImages) : collectImages(html, baseUrl);


  const logo =
    images.find((u) => /logo/i.test(u)) || metaContent(html, "og:image") || images[0] || "";

  const phones = uniq(
    Array.from(html.matchAll(/tel:\+?([0-9()\-.\s]{7,})/gi)).map((m) => decode(m[1])),
  ).slice(0, 5);

  const emails = uniq(
    Array.from(html.matchAll(/mailto:([^"'?\s>]+@[^"'?\s>]+)/gi)).map((m) => m[1]),
  ).slice(0, 5);

  const headings = uniq(
    Array.from(html.matchAll(/<h([2-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi))
      .map((m) => decode(m[2]))
      .filter((t) => t.length > 2 && t.length < 60),
  );

  const paragraphs = uniq(
    Array.from(html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
      .map((m) => decode(m[1]))
      .filter((t) => t.length > 80),
  );

  const listItems = uniq(
    Array.from(html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi))
      .map((m) => decode(m[1]))
      .filter((t) => t.length > 3 && t.length < 40),
  );

  const mapUrl =
    html.match(/https:\/\/www\.google\.com\/maps\/embed\?[^"'<>\s]+/i)?.[0] ?? "";

  const socialHosts: Record<string, string> = {
    "facebook.com": "Facebook",
    "instagram.com": "Instagram",
    "x.com": "Twitter",
    "twitter.com": "Twitter",
    "pinterest.com": "Pinterest",
    "youtube.com": "YouTube",
    "linkedin.com": "LinkedIn",
    "tiktok.com": "TikTok",
  };
  const socialIcons: Record<string, string> = {
    Facebook: "facebook-f",
    Instagram: "instagram",
    Twitter: "twitter",
    Pinterest: "pinterest-p",
    YouTube: "youtube",
    LinkedIn: "linkedin-in",
    TikTok: "tiktok",
  };
  const dirHosts: Record<string, string> = {
    "yelp.com": "Yelp",
    "manta.com": "Manta",
    "porch.com": "Porch",
    "merchantcircle.com": "MerchantCircle",
    "buildzoom.com": "Buildzoom",
    "bbb.org": "BBB",
    "angi.com": "Angi",
    "thumbtack.com": "Thumbtack",
    "houzz.com": "Houzz",
    "nextdoor.com": "Nextdoor",
    "homeadvisor.com": "HomeAdvisor",
    "alignable.com": "Alignable",
  };

  const hrefs = uniq(
    Array.from(html.matchAll(/href\s*=\s*["'](https?:\/\/[^"']+)["']/gi)).map((m) => m[1]),
  );
  const redes: { name: string; url: string; icon: string; image: string }[] = [];
  const directorios: { name: string; url: string; icon: string; image: string }[] = [];
  const seenHost = new Set<string>();
  for (const href of hrefs) {
    let host = "";
    try {
      host = new URL(href).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    const social = Object.entries(socialHosts).find(([h]) => host.endsWith(h));
    const dir = Object.entries(dirHosts).find(([h]) => host.endsWith(h));
    if (social && !seenHost.has(social[0])) {
      seenHost.add(social[0]);
      redes.push({
        name: social[1],
        url: href,
        icon: socialIcons[social[1]] ?? "",
        image: "",
      });
    } else if (dir && !seenHost.has(dir[0])) {
      seenHost.add(dir[0]);
      directorios.push({ name: dir[1], url: href, icon: "", image: "" });
    }
  }

  const gmbLink =
    hrefs.find((h) => /g\.page\/r\/|maps\.app\.goo\.gl|google\.com\/maps/i.test(h)) ?? "";

  const ytChannel =
    html.match(/youtube\.com\/(?:channel\/|@)([A-Za-z0-9_\-]+)/i)?.[1] ?? "";

  const sections = sectionsFromHtml(html, baseUrl).filter((s) => s.images.length > 0);
  const galleryWords = /gallery|galer|project|work|recent/i;

  const serviceSections = sections.filter(
    (s) => !galleryWords.test(s.title) && s.title !== "general",
  );

  const services = (serviceSections.length ? serviceSections : sections)
    .slice(0, 14)
    .map((s) => ({
      name: s.title,
      subtitle: "",
      description: (s.images.slice(0, 3).length ? s.images.slice(0, 3) : [""]).map(
        (img, i) => ({
          img,
          text: i === 0 ? s.text || paragraphs[0] || "" : "",
          lists: [] as string[],
        }),
      ),
    }));

  const landings = sections
    .filter((s) => s.title !== "general" && s.images.length > 1)
    .slice(0, 12)
    .map((s) => ({ name: s.title, description: s.text ? s.text.slice(0, 300) : "", gallery: s.images }));

  const galleryImages = uniq(
    sections.filter((s) => galleryWords.test(s.title)).flatMap((s) => s.images),
  );

  const workdays = uniq(
    Array.from(
      html.matchAll(
        /((?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\s*(?:-|–|to)\s*(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day)/gi,
      ),
    ).map((m) => decode(m[1])),
  ).slice(0, 3);

  const workHours = uniq(
    Array.from(
      html.matchAll(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM)\s*(?:-|–|to)\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM))/gi),
    ).map((m) => decode(m[1])),
  ).slice(0, 3);

  const values = ["Mission", "Vision", "Values"]
    .map((t) => ({ title: t, description: afterHeading(html, new RegExp(t, "i")) }))
    .filter((v) => v.description);

  const styleColors = uniq(
    Array.from(html.matchAll(/#([0-9a-f]{6})\b/gi)).map((m) => `#${m[1].toLowerCase()}`),
  ).filter((c) => !/^#(fff|000)/.test(c.replace(/(.)\1/g, "$1")));

  return {
    dbPrincipal: {
      name,
      logo: abs(logo, baseUrl) ?? logo,
      favicon: favicon ? (abs(favicon, baseUrl) ?? favicon) : "",
      location: [
        {
          address:
            metaContent(html, "og:locality") ||
            html.match(/\b([A-Z][a-zA-Z .]+,\s*(?:[A-Z]{2}))\b/)?.[1] ||
            "",
          url: mapUrl,
          lat: "",
          long: "",
        },
      ],
      phones: phones.map((phone) => ({ name: "", phone })),
      emails: emails.map((email) => ({ name: "", email })),
      exprYears: html.match(/(\d{1,2})\+?\s*years?\s+of\s+experience/i)?.[1] ?? "",
      workdays: workdays.map((day) => ({ day })),
      workHours: workHours.map((hour) => ({ hour })),
      miles: html.match(/(\d{1,3})\s*miles?/i)?.[1] ?? "",
      licensed:
        html.match(/(?:We\s+Are\s+)?Licen[cs]ed[^<.,]{0,40}(?:Lic\.?\s*#?\s*\d{4,})?/i)?.[0]?.trim() ??
        "",
      paymentMethod:
        decode(html.match(/We\s+Accept[^<.]{0,80}/i)?.[0] ?? "") || "",
    },
    dbSocialMedia: { redes, directorios },
    gmb: { link: gmbLink, icon: "", img: "" },
    labels: {
      general: {
        titleServices: headings.find((h) => /service/i.test(h)) ?? "Our Services",
        titleGallery: headings.find((h) => /gallery|project/i.test(h)) ?? "Our Recent Projects",
        titleMap: "",
        titleBranding: "",
        titleReviews: headings.find((h) => /review|testimonial/i.test(h)) ?? "Our Reviews",
      },
      formLabel: {
        tname: "Name",
        tlname: "Last Name",
        temail: "Email",
        tphone: "Phone",
        taddress: "Address",
        ttypeservice: "Select The Service You Need",
        tbestway: "Best Way To Contact You",
        tcheckphone: "Phone",
        tcheckcorreo: "Email",
        tmessage: "Message",
        tbutton: "Send A Message",
        isenglish: "true",
      },
    },
    dbSlogan: uniq(
      Array.from(html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)).map((m) => decode(m[1])),
    )
      .filter(Boolean)
      .map((slogan) => ({ slogan })),
    dbHome: paragraphs.slice(0, 2).map((text) => ({ text })),
    dbAbout: paragraphs.slice(0, 2).map((text, i) => ({
      text,
      list: i === 0 ? listItems.slice(0, 6) : [],
    })),
    dbValues: values,
    dbServices: services,
    linkPostEmail: "https://email-server-r-8fb46242f2ca.herokuapp.com/email/",
    linkWeb: new URL(baseUrl).origin,
    Activo: true,
    autoGntLandingFromService: true,
    FechaCreacion: new Date().toISOString(),
    gallery: galleryImages.length ? galleryImages : images,
    stock: images,
    landings,

    works: [] as unknown[],
    videosPromo: [] as unknown[],
    tiposPago: [] as unknown[],
    brandingExtra: [] as unknown[],
    activeEvent: [] as unknown[],
    simpleWidgets: [] as unknown[],
    ytGallery: { linkCanalYT: ytChannel, links: [] as unknown[], isHomeOnly: false },
    appoimentImg: "",
    qrImg: "",
    styles: {
      mainColor: styleColors[0] ?? "",
      secondaryColor: styleColors[1] ?? "",
      thirdColor: styleColors[2] ?? "",
      headingTextColor: "#000000",
      paragraphTextColor: "#000000",
      bgFooter: "#1e1e1e",
      btn: styleColors[1] ?? styleColors[0] ?? "",
      btnHover: styleColors[2] ?? "",
      scrollColor: styleColors[0] ?? "",
      iconsMenuMovil: "#FFFFFF",
      overlayColor: "#FFFFFF",
    },
    customLinks: false,
    reviews: { activo: false, isHomeOnly: false, links: [] as unknown[] },
    beforeAfterGall: [] as unknown[],
    waterMark: { isActive: false, position: "TopLeft", width: 50, opacity: 1 },
    spanishVersion: { isActive: false, id: "" },
    docId: "",
  };
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ImageConverterRight/1.0)",
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

export const fetchSiteData = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<SiteDataResult> => {
    const notes: string[] = [];
    const apiUrl = process.env["REAKTORX_API_URL"] ?? "";
    const apiKey = process.env["REAKTORX_API_KEY"] ?? "";

    if (data.id) {
      try {
        const res = await fetch(`${apiUrl}/${encodeURIComponent(data.id)}`, {
          headers: {
            "x-api-key": apiKey,
            "api-key": apiKey,
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
        });
        const text = await res.text();
        if (res.ok && text.trim()) {
          try {
            return { source: "api", data: JSON.parse(text) as SiteData, error: null, notes };
          } catch {
            notes.push("La API respondió con un formato no JSON.");
          }
        } else {
          notes.push(`La API devolvió ${res.status} sin datos para el ID ${data.id}.`);
        }
      } catch (err) {
        notes.push(`Error al consultar la API: ${err instanceof Error ? err.message : "desconocido"}`);
      }
    }

    if (data.url) {
      const normalized = /^https?:\/\//i.test(data.url) ? data.url : `https://${data.url}`;
      const page = await fetchHtml(normalized);
      if (!page) {
        return { source: null, data: null, error: "No se pudo leer el sitio web.", notes };
      }

      const origin = new URL(page.finalUrl).origin;
      const internal = uniq(
        Array.from(page.html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi))
          .map((m) => abs(m[1], page.finalUrl) ?? "")
          .filter((u) => u.startsWith(origin) && !IMG_EXT.test(u) && !/\.(pdf|zip|mp4)$/i.test(u)),
      ).filter((u) => u !== page.finalUrl);

      const priority = internal
        .sort((a, b) => {
          const w = (u: string) =>
            /gallery|galer|project|portfolio|work|service|about|contact/i.test(u) ? 0 : 1;
          return w(a) - w(b);
        })
        .slice(0, 12);

      const pages = await Promise.all(priority.map((u) => fetchHtml(u)));
      const extraHtml: string[] = [];
      let images = collectImages(page.html, page.finalUrl);
      for (const p of pages) {
        if (!p) continue;
        extraHtml.push(p.html);
        images = images.concat(collectImages(p.html, p.finalUrl));
      }
      images = uniq(images);

      const built = buildFromHtml(
        [page.html, ...extraHtml].join("\n"),
        page.finalUrl,
        images,
      ) as unknown as SiteData;
      (built as { docId: string }).docId = data.id ?? "";
      notes.push(
        `Data generada extrayendo el sitio web (${1 + extraHtml.length} páginas, ${images.length} imágenes).`,
      );
      return { source: "scrape", data: built, error: null, notes };
    }


    return {
      source: null,
      data: null,
      error: data.id
        ? "La API no devolvió data para ese ID. Agrega la URL del sitio para extraerla."
        : "Ingresa un ID o una URL.",
      notes,
    };
  });
