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
import { Download, FileArchive, FolderUp, ImageUp, Loader2, Minimize2, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
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

  const checkVideos = (files: File[]): boolean => {
    const videos = files.filter(isVideoFile);
    if (videos.length > 0) {
      toast.error("No se aceptan videos", {
        description: `Detectado: ${videos.slice(0, 3).map((v) => v.name).join(", ")}${videos.length > 3 ? "…" : ""}`,
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

  const onDrop = async (
    e: React.DragEvent<HTMLButtonElement>,
    target: Exclude<DropTarget, null>,
  ) => {
    e.preventDefault();
    setDragOver(null);
    if (busy) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;

    if (target === "folder") {
      // Try to derive a folder name from the first file's path if available
      const first = files[0] as File & { webkitRelativePath?: string };
      const rel = first.webkitRelativePath ?? "";
      const folderName = rel.split("/")[0] || "carpeta";
      await processFolderConvert(files, folderName);
    } else if (target === "image") {
      await processImagesForConvert(files);
    } else {
      await processCompress(files);
    }
  };

  const onDragOver = (
    e: React.DragEvent<HTMLButtonElement>,
    target: Exclude<DropTarget, null>,
  ) => {
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

  const dropClasses = (target: Exclude<DropTarget, null>) =>
    `group relative overflow-hidden rounded-2xl border-2 border-dashed p-8 text-left transition-all disabled:opacity-50 ${
      dragOver === target
        ? "border-primary bg-accent shadow-lg scale-[1.02]"
        : "border-border bg-background hover:border-primary hover:shadow-lg"
    }`;

  return (
    <div className="relative min-h-screen" style={{ background: "var(--gradient-soft)" }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--gradient-accent)" }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-5xl px-6 py-16">
        <div className="mb-6 flex justify-end">
          <ThemeToggle />
        </div>
        <header className="mb-12 text-center">
          <img
            src={logoRoyal}
            alt="Royal Dirkz Group"
            className="mx-auto mb-6 h-20 w-auto md:h-24"
          />
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            Convertidor en el navegador · 100% privado
          </div>
          <h1
            className="bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-6xl"
            style={{ backgroundImage: "var(--gradient-primary)" }}
          >
            Convertidor de Imágenes
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
            Convierte imágenes individuales o carpetas completas a JPG, PNG, WebP o TIFF, o reduce
            el peso de tus imágenes.
          </p>
        </header>

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

          <button
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.multiple = true;
              input.accept = "image/*,.heic,.heif,.tif,.tiff";
              input.onchange = async () => {
                const files = Array.from(input.files ?? []);
                if (files.length > 0) await processCompress(files);
              };
              input.click();
            }}
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
                const saved = Math.max(
                  0,
                  Math.round((1 - item.newSize / item.originalSize) * 100),
                );
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
