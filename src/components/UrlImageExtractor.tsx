import { useState } from "react";
import JSZip from "jszip";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Download, Globe, Loader2, Search, Folder } from "lucide-react";
import { extractImagesFromUrl, type ImageSection } from "@/lib/extractImages.functions";

function sanitizeFolderClient(s: string): string {
  const clean = s
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return clean || "general";
}

export function UrlImageExtractor() {
  const extract = useServerFn(extractImagesFromUrl);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [sections, setSections] = useState<ImageSection[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const normalizeInput = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const totalImages = sections.reduce((n, s) => n + s.images.length, 0);

  const handleExtract = async () => {
    const finalUrl = normalizeInput(url);
    if (!finalUrl) {
      toast.error("Ingresa una URL o dominio");
      return;
    }
    setLoading(true);
    setSections([]);
    setSelected(new Set());
    try {
      const res = await extract({ data: { url: finalUrl } });
      if (res.error) {
        toast.error(res.error);
      } else if (!res.sections || res.sections.length === 0) {
        toast.info("No se encontraron imágenes en ese sitio");
      } else {
        setSections(res.sections);
        const all = new Set<string>();
        for (const s of res.sections) for (const u of s.images) all.add(u);
        setSelected(all);
        toast.success("Extracción realizada", {
          description: `${all.size} imágenes en ${res.sections.length} carpeta(s), ${res.pagesScanned} página(s) analizada(s). Para una extracción exacta usar extensión.`,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al extraer imágenes");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (u: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u);
      else next.add(u);
      return next;
    });
  };

  const toggleSection = (s: ImageSection) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allIn = s.images.every((u) => next.has(u));
      if (allIn) s.images.forEach((u) => next.delete(u));
      else s.images.forEach((u) => next.add(u));
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === totalImages) setSelected(new Set());
    else {
      const all = new Set<string>();
      for (const s of sections) for (const u of s.images) all.add(u);
      setSelected(all);
    }
  };

  const filenameFromUrl = (u: string, i: number) => {
    try {
      const parsed = new URL(u);
      const last = parsed.pathname.split("/").pop() || `image-${i}`;
      const clean = last.split("?")[0] || `image-${i}`;
      if (/\.(jpe?g|png|webp|gif|bmp|tiff?|heic|avif)$/i.test(clean)) return clean;
      return `${clean || `image-${i}`}.jpg`;
    } catch {
      return `image-${i}.jpg`;
    }
  };

  const downloadZip = async () => {
    if (selected.size === 0) {
      toast.error("Selecciona al menos una imagen");
      return;
    }
    setDownloading(true);
    const zip = new JSZip();
    const root = zip.folder("extracion_img")!;
    let ok = 0;
    let fail = 0;

    const tasks: Promise<void>[] = [];
    let globalIdx = 0;
    for (const section of sections) {
      const folderName = sanitizeFolderClient(section.title);
      const folder = root.folder(folderName)!;
      let localIdx = 0;
      for (const u of section.images) {
        if (!selected.has(u)) continue;
        const fname = filenameFromUrl(u, globalIdx++);
        const idxForName = localIdx++;
        tasks.push(
          (async () => {
            try {
              const r = await fetch(u, { mode: "cors" });
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              const blob = await r.blob();
              // Avoid filename collisions inside the folder
              const finalName = folder.file(fname)
                ? `${idxForName}_${fname}`
                : fname;
              folder.file(finalName, blob);
              ok++;
            } catch {
              fail++;
            }
          })(),
        );
      }
    }
    await Promise.all(tasks);

    if (ok === 0) {
      toast.error("No se pudo descargar ninguna imagen (CORS/bloqueo del servidor)");
      setDownloading(false);
      return;
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "extracion_img.zip";
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Descargadas ${ok}${fail ? ` (${fail} fallaron)` : ""}`);
    setDownloading(false);
  };

  return (
    <section
      className="mt-8 rounded-3xl border border-border bg-card p-6 md:p-8"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="mb-4 flex items-center gap-2">
        <Globe className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Extraer imágenes de un sitio web</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Pega una URL o dominio. Las imágenes se agrupan automáticamente por los títulos
        (encabezados) que aparecen en la página y se descargan en subcarpetas con ese nombre.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="text"
          placeholder="https://ejemplo.com  o  ejemplo.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleExtract();
          }}
          disabled={loading}
          className="flex-1"
        />
        <Button onClick={handleExtract} disabled={loading} className="rounded-full gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? "Extrayendo..." : "Extraer"}
        </Button>
      </div>

      {sections.length > 0 && (
        <>
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{totalImages}</strong> imágenes en{" "}
              <strong className="text-foreground">{sections.length}</strong> carpeta(s) ·{" "}
              <strong className="text-foreground">{selected.size}</strong> seleccionadas
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={toggleAll} className="rounded-full">
                {selected.size === totalImages ? "Deseleccionar todas" : "Seleccionar todas"}
              </Button>
              <Button
                size="sm"
                onClick={downloadZip}
                disabled={downloading || selected.size === 0}
                className="rounded-full gap-2"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Descargar ZIP
              </Button>
            </div>
          </div>

          <div className="mt-4 max-h-[28rem] space-y-4 overflow-y-auto rounded-xl border border-border bg-background p-3">
            {sections.map((section, sIdx) => {
              const selCount = section.images.filter((u) => selected.has(u)).length;
              return (
                <div key={`${section.title}-${sIdx}`} className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Folder className="h-4 w-4 text-primary shrink-0" />
                      <h3 className="truncate text-sm font-semibold" title={section.title}>
                        {section.title}
                      </h3>
                      <span className="text-xs text-muted-foreground shrink-0">
                        ({selCount}/{section.images.length})
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-full text-xs"
                      onClick={() => toggleSection(section)}
                    >
                      {selCount === section.images.length ? "Quitar" : "Seleccionar"}
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                    {section.images.map((u) => {
                      const isSel = selected.has(u);
                      return (
                        <button
                          type="button"
                          key={u}
                          onClick={() => toggle(u)}
                          className={`relative aspect-square overflow-hidden rounded-lg border-2 transition ${
                            isSel ? "border-primary" : "border-transparent"
                          }`}
                          title={u}
                        >
                          <img
                            src={u}
                            alt=""
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
                            }}
                          />
                          {isSel && (
                            <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Algunas imágenes pueden no descargarse si el servidor de origen bloquea CORS. En ese
            caso usa la extensión de Chrome.
          </p>
        </>
      )}
    </section>
  );
}
