import { useRef, useState } from "react";
import JSZip from "jszip";
import {
  compressImage,
  convertImage,
  isImageFile,
  isVideoFile,
  type TargetFormat,
} from "@/lib/imageConverter";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  Download,
  FileArchive,
  FolderUp,
  ImageUp,
  Loader2,
  Minimize2,
  Sparkles,
  Trash2,
} from "lucide-react";
import logoRoyal from "@/assets/logo-royal.png";

type ConvertedItem = {
  id: string;
  name: string;
  url: string;
  blob: Blob;
};

type CompressedItem = ConvertedItem & {
  originalSize: number;
  newSize: number;
};

type DropTarget = "folder" | "image" | "compress" | null;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

type FileWithPath = File & { relativePath?: string };

async function readEntriesAll(reader: any): Promise<any[]> {
  const all: any[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
    if (!batch.length) break;
    all.push(...batch);
  }
  return all;
}

async function walkEntry(entry: any, path: string, out: FileWithPath[]): Promise<void> {
  if (!entry) return;
  if (entry.isFile) {
    const file: File = await new Promise((res, rej) => entry.file(res, rej));
    const fp = file as FileWithPath;
    fp.relativePath = path + entry.name;
    out.push(fp);
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries = await readEntriesAll(reader);
    for (const child of entries) {
      await walkEntry(child, path + entry.name + "/", out);
    }
  }
}

async function filesFromDataTransfer(dt: DataTransfer): Promise<FileWithPath[]> {
  const items = dt.items;
  const out: FileWithPath[] = [];
  if (items && items.length && typeof (items[0] as any).webkitGetAsEntry === "function") {
    const entries: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const e = (items[i] as any).webkitGetAsEntry?.();
      if (e) entries.push(e);
    }
    if (entries.length) {
      for (const entry of entries) await walkEntry(entry, "", out);
      return out;
    }
  }
  // Fallback: just files
  return Array.from(dt.files ?? []) as FileWithPath[];
}

export function ImageConverter() {
  const [format, setFormat] = useState<TargetFormat>("jpg");
  const [quality, setQuality] = useState<number>(70);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [ourImg, setOurImg] = useState<ConvertedItem[]>([]);
  const [compressed, setCompressed] = useState<CompressedItem[]>([]);
  const [folderResult, setFolderResult] = useState<{
    name: string;
    zipUrl: string;
    count: number;
  } | null>(null);
  const [dragOver, setDragOver] = useState<DropTarget>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const compressFolderInputRef = useRef<HTMLInputElement>(null);
  const compressFileInputRef = useRef<HTMLInputElement>(null);

  const checkVideos = (files: File[]): boolean => {
    const videos = files.filter(isVideoFile);
    if (videos.length > 0) {
      toast.error("No se aceptan videos", {
        description: `Detectado: ${videos
          .slice(0, 3)
          .map((v) => v.name)
          .join(", ")}${videos.length > 3 ? "…" : ""}`,
      });
      return true;
    }
    return false;
  };

  const processImagesForConvert = async (files: File[]) => {
    if (checkVideos(files)) return;
    const images = files.filter(isImageFile);
    if (images.length === 0) {
      toast.error("No se encontraron imágenes válidas");
      return;
    }
    setBusy(true);
    setProgress({ done: 0, total: images.length });
    const results: ConvertedItem[] = [];
    for (let i = 0; i < images.length; i++) {
      try {
        const { blob, filename } = await convertImage(images[i], format);
        results.push({
          id: `${Date.now()}-${i}`,
          name: filename,
          url: URL.createObjectURL(blob),
          blob,
        });
      } catch (err) {
        console.error(err);
        toast.error(`Error con ${images[i].name}`);
      }
      setProgress({ done: i + 1, total: images.length });
    }
    setOurImg((prev) => [...results, ...prev]);
    setBusy(false);
    setProgress(null);
    toast.success(`${results.length} imagen(es) agregadas a "our img"`);
  };

  const processFolderConvert = async (files: File[], folderName: string) => {
    if (checkVideos(files)) return;
    const images = files.filter(isImageFile);
    if (images.length === 0) {
      toast.error("La carpeta no contiene imágenes");
      return;
    }
    setBusy(true);
    setProgress({ done: 0, total: images.length });
    const zip = new JSZip();
    const outFolder = zip.folder(`${folderName}_convertido`)!;
    for (let i = 0; i < images.length; i++) {
      try {
        const { blob, filename } = await convertImage(images[i], format);
        outFolder.file(filename, blob);
      } catch (err) {
        console.error(err);
        toast.error(`Error con ${images[i].name}`);
      }
      setProgress({ done: i + 1, total: images.length });
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    setFolderResult({ name: `${folderName}_convertido.zip`, zipUrl: url, count: images.length });
    setBusy(false);
    setProgress(null);
    toast.success(`Carpeta convertida: ${images.length} imagen(es)`);
  };

  const processCompress = async (files: File[]) => {
    if (checkVideos(files)) return;
    const images = files.filter(isImageFile);
    if (images.length === 0) {
      toast.error("No se encontraron imágenes válidas");
      return;
    }
    setBusy(true);
    setProgress({ done: 0, total: images.length });
    const results: CompressedItem[] = [];
    for (let i = 0; i < images.length; i++) {
      try {
        const { blob, filename, originalSize, newSize } = await compressImage(
          images[i],
          quality / 100,
        );
        results.push({
          id: `${Date.now()}-c-${i}`,
          name: filename,
          url: URL.createObjectURL(blob),
          blob,
          originalSize,
          newSize,
        });
      } catch (err) {
        console.error(err);
        toast.error(`Error con ${images[i].name}`);
      }
      setProgress({ done: i + 1, total: images.length });
    }
    setCompressed((prev) => [...results, ...prev]);
    setBusy(false);
    setProgress(null);
    toast.success(`${results.length} imagen(es) comprimida(s)`);
  };

  const processCompressFolder = async (files: FileWithPath[], folderName: string) => {
    if (checkVideos(files)) return;
    const images = files.filter(isImageFile);
    if (images.length === 0) {
      toast.error("La carpeta no contiene imágenes");
      return;
    }
    setBusy(true);
    setProgress({ done: 0, total: images.length });
    const zip = new JSZip();
    const root = zip.folder(`${folderName}_comprimido`)!;
    let totalOrig = 0;
    let totalNew = 0;
    for (let i = 0; i < images.length; i++) {
      try {
        const { blob, filename, originalSize, newSize } = await compressImage(
          images[i],
          quality / 100,
        );
        totalOrig += originalSize;
        totalNew += newSize;
        const rel =
          (images[i] as FileWithPath).relativePath ??
          (images[i] as File & { webkitRelativePath?: string }).webkitRelativePath ??
          images[i].name;
        const parts = rel.split("/");
        if (parts.length > 1 && parts[0] === folderName) parts.shift();
        parts[parts.length - 1] = filename;
        root.file(parts.join("/"), blob);
      } catch (err) {
        console.error(err);
        toast.error(`Error con ${images[i].name}`);
      }
      setProgress({ done: i + 1, total: images.length });
    }
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const saved = totalOrig > 0 ? Math.max(0, Math.round((1 - totalNew / totalOrig) * 100)) : 0;
    setCompressed((prev) => [
      {
        id: `${Date.now()}-zip`,
        name: `${folderName}_comprimido.zip`,
        url,
        blob: zipBlob,
        originalSize: totalOrig,
        newSize: totalNew,
      },
      ...prev,
    ]);
    setBusy(false);
    setProgress(null);
    toast.success(`Carpeta comprimida: ${images.length} imagen(es) · −${saved}%`);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    await processImagesForConvert(files);
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const first = files[0] as File & { webkitRelativePath?: string };
    const rel = first.webkitRelativePath ?? "";
    const folderName = rel.split("/")[0] || "carpeta";
    await processFolderConvert(files, folderName);
  };

  const handleCompressFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []) as FileWithPath[];
    e.target.value = "";
    if (files.length === 0) return;
    files.forEach((f) => {
      const wf = f as File & { webkitRelativePath?: string };
      f.relativePath = wf.webkitRelativePath ?? f.name;
    });
    const first = files[0] as File & { webkitRelativePath?: string };
    const rel = first.webkitRelativePath ?? "";
    const folderName = rel.split("/")[0] || "carpeta";
    await processCompressFolder(files, folderName);
  };

  const onDrop = async (
    e: React.DragEvent<HTMLButtonElement>,
    target: Exclude<DropTarget, null>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    if (busy) return;

    // Capture references BEFORE any await — React pools synthetic events
    const dt = e.dataTransfer;
    const itemsList: any[] = [];
    if (dt.items && dt.items.length) {
      for (let i = 0; i < dt.items.length; i++) {
        const it = dt.items[i] as any;
        const entry = typeof it.webkitGetAsEntry === "function" ? it.webkitGetAsEntry() : null;
        if (entry) itemsList.push(entry);
      }
    }
    const fallbackFiles = Array.from(dt.files ?? []) as FileWithPath[];

    let files: FileWithPath[] = [];
    if (itemsList.length) {
      const out: FileWithPath[] = [];
      for (const entry of itemsList) await walkEntry(entry, "", out);
      files = out;
    }
    if (files.length === 0) files = fallbackFiles;
    if (files.length === 0) return;

    const hasFolder = files.some((f) => (f.relativePath ?? "").includes("/"));
    const folderName = (files[0].relativePath ?? "").split("/")[0] || "carpeta";

    if (target === "folder") {
      await processFolderConvert(files, folderName);
    } else if (target === "image") {
      await processImagesForConvert(files);
    } else {
      if (hasFolder) {
        await processCompressFolder(files, folderName);
      } else {
        await processCompress(files);
      }
    }
  };

  const onDragOver = (e: React.DragEvent<HTMLButtonElement>, target: Exclude<DropTarget, null>) => {
    e.preventDefault();
    if (!busy) setDragOver(target);
  };

  const onDragLeave = () => setDragOver(null);

  const downloadOne = (item: ConvertedItem) => {
    const a = document.createElement("a");
    a.href = item.url;
    a.download = item.name;
    a.click();
  };

  const downloadAllOurImg = async () => {
    if (ourImg.length === 0) return;
    const zip = new JSZip();
    const folder = zip.folder("our img")!;
    ourImg.forEach((it) => folder.file(it.name, it.blob));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "our_img.zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const downloadAllCompressed = async () => {
    if (compressed.length === 0) return;
    const zip = new JSZip();
    const folder = zip.folder("comprimidas")!;
    compressed.forEach((it) => folder.file(it.name, it.blob));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "comprimidas.zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const clearAll = () => {
    const totalItems = ourImg.length + compressed.length + (folderResult ? 1 : 0);
    ourImg.forEach((it) => URL.revokeObjectURL(it.url));
    compressed.forEach((it) => URL.revokeObjectURL(it.url));
    if (folderResult) URL.revokeObjectURL(folderResult.zipUrl);
    setOurImg([]);
    setCompressed([]);
    setFolderResult(null);
    setProgress(null);
    setBusy(false);
    setDragOver(null);
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (err) {
      console.error(err);
    }
    if (totalItems > 0) {
      toast.success(`Limpieza completa · ${totalItems} elemento(s) eliminados`);
    } else {
      toast.success("Datos locales limpiados");
    }
  };

  const dropClasses = (target: Exclude<DropTarget, null>) =>
    `group relative overflow-hidden rounded-2xl border-2 border-dashed p-8 text-left transition-all disabled:opacity-50 ${
      dragOver === target
        ? "border-primary bg-accent shadow-lg scale-[1.02]"
        : "border-border bg-background hover:border-primary hover:shadow-lg"
    }`;

  return (
    <div
      className="relative min-h-screen capitalize"
      style={{ background: "var(--gradient-soft)" }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--gradient-accent)" }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-5xl px-6 py-16">
        <div className="mb-6 flex justify-end gap-2">
          <Button asChild variant="outline" className="rounded-full">
            <a href="https://orderimgdirkz.lovable.app/" target="_blank" rel="noopener noreferrer">
              Ordenar imágenes
            </a>
          </Button>
          <Button
            onClick={clearAll}
            variant="outline"
            disabled={busy}
            className="rounded-full gap-2"
          >
            <Trash2 className="h-4 w-4" /> Limpiar todo
          </Button>
          <ThemeToggle />
        </div>
        <header className="mb-12 text-center">
          <img
            src={logoRoyal}
            alt="Image Converter Right"
            className="mx-auto mb-6 rounded-full w-56 h-56 object-contain"
          />
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            Image Converter Right · 100% privado
          </div>
          <h1
            className="bg-clip-text text-2xl font-bold tracking-tight text-transparent lg:text-6xl lg:h-20"
            style={{ backgroundImage: "var(--gradient-primary)" }}
          >
            Image Converter Right
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
            Convierte imágenes individuales o carpetas completas a JPG, PNG, WebP o TIFF, o reduce
            el peso de tus imágenes.
          </p>
          <div className="mt-6 flex justify-center capitalize gap-4">
            <Button
              type="button"
              onClick={() => {
                fetch("/gallery-extractor.zip")
                  .then((r) => {
                    if (!r.ok) throw new Error("No se pudo descargar el ZIP");
                    return r.blob();
                  })
                  .then((blob) => {
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = "gallery-extractor.zip";
                    a.click();
                    URL.revokeObjectURL(a.href);
                  })
                  .catch((err) => alert(err.message));
              }}
              className="rounded-full gap-2"
            >
              <Download className="h-4 w-4" /> Descargar extensión Chrome (Dallery Extractor Right)
            </Button>
          </div>
        </header>

        <div className="mb-8 ">
          <UrlImageExtractor />
        </div>

        <div className="mb-8">
          <MejorarCalidadImg />
        </div>

        <section
          className="rounded-3xl border border-border bg-card p-8"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="text-sm font-semibold text-foreground">Convertir a:</label>
            <Select value={format} onValueChange={(v) => setFormat(v as TargetFormat)}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="jpg">JPG</SelectItem>
                <SelectItem value="png">PNG</SelectItem>
                <SelectItem value="webp">WebP</SelectItem>
                <SelectItem value="tiff">TIFF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <button
              onClick={() => folderInputRef.current?.click()}
              onDrop={(e) => onDrop(e, "folder")}
              onDragOver={(e) => onDragOver(e, "folder")}
              onDragLeave={onDragLeave}
              disabled={busy}
              className={dropClasses("folder")}
            >
              <FolderUp className="mb-3 h-8 w-8 text-primary transition-transform group-hover:scale-110" />
              <h3 className="text-lg font-semibold text-foreground">Subir carpeta</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Arrastra o haz clic. Las imágenes se descargan en{" "}
                <span className="font-mono text-foreground">nombre_convertido.zip</span>
              </p>
            </button>

            <button
              onClick={() => imageInputRef.current?.click()}
              onDrop={(e) => onDrop(e, "image")}
              onDragOver={(e) => onDragOver(e, "image")}
              onDragLeave={onDragLeave}
              disabled={busy}
              className={dropClasses("image")}
            >
              <ImageUp className="mb-3 h-8 w-8 text-primary transition-transform group-hover:scale-110" />
              <h3 className="text-lg font-semibold text-foreground">Subir imagen</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Arrastra o haz clic. Se añadirán a{" "}
                <span className="font-mono text-foreground">our img</span>
              </p>
            </button>
          </div>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*,.heic,.heif,.tif,.tiff"
            multiple
            className="hidden"
            onChange={handleImageUpload}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            // @ts-expect-error non-standard but supported
            webkitdirectory=""
            directory=""
            onChange={handleFolderUpload}
          />

          {busy && progress && (
            <div className="mt-6 flex items-center gap-3 rounded-xl bg-muted p-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <div className="mb-1 flex justify-between text-sm font-medium">
                  <span>Procesando…</span>
                  <span>
                    {progress.done} / {progress.total}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${(progress.done / progress.total) * 100}%`,
                      background: "var(--gradient-primary)",
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Compresión */}
        <section
          className="mt-8 rounded-3xl border border-border bg-card p-8"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
                <Minimize2 className="h-5 w-5 text-primary" /> Bajar peso de imágenes
              </h2>
              <p className="text-sm text-muted-foreground">
                Reduce el tamaño manteniendo buena calidad visual.
              </p>
            </div>
            <div className="w-full sm:w-72">
              <div className="mb-2 flex justify-between text-xs font-medium text-muted-foreground">
                <span>Calidad</span>
                <span className="font-mono text-foreground">{quality}%</span>
              </div>
              <Slider
                value={[quality]}
                min={10}
                max={95}
                step={5}
                onValueChange={(v) => setQuality(v[0])}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <button
              onClick={() => compressFileInputRef.current?.click()}
              onDrop={(e) => onDrop(e, "compress")}
              onDragOver={(e) => onDragOver(e, "compress")}
              onDragLeave={onDragLeave}
              disabled={busy}
              className={dropClasses("compress")}
            >
              <FileArchive className="mb-3 h-8 w-8 text-primary transition-transform group-hover:scale-110" />
              <h3 className="text-lg font-semibold text-foreground">Comprimir imágenes</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Arrastra imágenes aquí o haz clic para seleccionarlas. Calidad ajustable.
              </p>
            </button>

            <button
              onClick={() => compressFolderInputRef.current?.click()}
              onDrop={(e) => onDrop(e, "compress")}
              onDragOver={(e) => onDragOver(e, "compress")}
              onDragLeave={onDragLeave}
              disabled={busy}
              className={dropClasses("compress")}
            >
              <FolderUp className="mb-3 h-8 w-8 text-primary transition-transform group-hover:scale-110" />
              <h3 className="text-lg font-semibold text-foreground">Comprimir carpeta</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Arrastra una carpeta (con subcarpetas) o haz clic. Se descarga como{" "}
                <span className="font-mono text-foreground">nombre_comprimido.zip</span>
              </p>
            </button>
          </div>

          <input
            ref={compressFileInputRef}
            type="file"
            accept="image/*,.heic,.heif,.tif,.tiff"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length > 0) await processCompress(files);
            }}
          />
          <input
            ref={compressFolderInputRef}
            type="file"
            multiple
            className="hidden"
            // @ts-expect-error non-standard but supported
            webkitdirectory=""
            directory=""
            onChange={handleCompressFolderUpload}
          />
        </section>

        {folderResult && (
          <section
            className="mt-8 rounded-3xl border border-border bg-card p-8"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Carpeta lista</h2>
                <p className="text-sm text-muted-foreground">
                  {folderResult.count} imagen(es) en {folderResult.name}
                </p>
              </div>
              <a href={folderResult.zipUrl} download={folderResult.name}>
                <Button size="lg" className="gap-2">
                  <Download className="h-4 w-4" /> Descargar ZIP
                </Button>
              </a>
            </div>
          </section>
        )}

        {compressed.length > 0 && (
          <section
            className="mt-8 rounded-3xl border border-border bg-card p-8"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Comprimidas</h2>
                <p className="text-sm text-muted-foreground">
                  {compressed.length} imagen(es) optimizada(s)
                </p>
              </div>
              <Button onClick={downloadAllCompressed} variant="outline" className="gap-2">
                <Download className="h-4 w-4" /> Descargar todo
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {compressed.map((item) => {
                const saved = Math.max(0, Math.round((1 - item.newSize / item.originalSize) * 100));
                return (
                  <div
                    key={item.id}
                    className="group overflow-hidden rounded-xl border border-border bg-background"
                  >
                    <div className="aspect-square overflow-hidden bg-muted">
                      <img
                        src={item.url}
                        alt={item.name}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    </div>
                    <div className="p-3">
                      <p className="truncate text-xs font-medium text-foreground" title={item.name}>
                        {item.name}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatBytes(item.originalSize)} → {formatBytes(item.newSize)}{" "}
                        <span className="font-semibold text-primary">−{saved}%</span>
                      </p>
                      <button
                        onClick={() => downloadOne(item)}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Download className="h-3 w-3" /> Descargar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {ourImg.length > 0 && (
          <section
            className="mt-8 rounded-3xl border border-border bg-card p-8"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">our img</h2>
                <p className="text-sm text-muted-foreground">
                  {ourImg.length} imagen(es) convertida(s)
                </p>
              </div>
              <Button onClick={downloadAllOurImg} variant="outline" className="gap-2">
                <Download className="h-4 w-4" /> Descargar todo
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {ourImg.map((item) => (
                <div
                  key={item.id}
                  className="group overflow-hidden rounded-xl border border-border bg-background"
                >
                  <div className="aspect-square overflow-hidden bg-muted">
                    <img
                      src={item.url}
                      alt={item.name}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </div>
                  <div className="p-3">
                    <p className="truncate text-xs font-medium text-foreground" title={item.name}>
                      {item.name}
                    </p>
                    <button
                      onClick={() => downloadOne(item)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <Download className="h-3 w-3" /> Descargar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
