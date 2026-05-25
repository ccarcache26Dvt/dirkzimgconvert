import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Sparkles, Upload, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { enhanceImage } from "@/lib/enhanceImage.functions";

function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [, b64] = result.split(",");
      resolve({ base64: b64, mime: file.type || "image/png" });
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

export function MejorarCalidadImg() {
  const callEnhance = useServerFn(enhanceImage);
  const inputRef = useRef<HTMLInputElement>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string>("imagen");

  const handlePick = () => inputRef.current?.click();

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecciona un archivo de imagen");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Máximo 8 MB. Usa una imagen más pequeña.");
      return;
    }
    setFileName(file.name.replace(/\.[^.]+$/, ""));
    setResultUrl(null);
    setOriginalUrl(URL.createObjectURL(file));
    setLoading(true);
    try {
      const { base64, mime } = await fileToBase64(file);
      const { imageUrl } = await callEnhance({
        data: { imageBase64: base64, mimeType: mime },
      });
      setResultUrl(imageUrl);
      toast.success("Imagen mejorada con IA");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al mejorar la imagen");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `${fileName}_mejorada.png`;
    a.click();
  };

  return (
    <section
      className="rounded-3xl border border-border bg-card p-6 md:p-8"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="mb-5 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Mejorar calidad con IA</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Reduce pixelado, restaura detalles, suaviza trazos de vectores y aumenta nitidez usando un modelo de segmentación/visión.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap gap-3">
        <Button onClick={handlePick} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {loading ? "Mejorando..." : "Subir imagen"}
        </Button>
        {resultUrl && (
          <Button variant="secondary" onClick={handleDownload} className="gap-2">
            <Download className="h-4 w-4" /> Descargar resultado
          </Button>
        )}
      </div>

      {(originalUrl || resultUrl) && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Original
            </p>
            <div className="overflow-hidden rounded-xl border border-border bg-background">
              {originalUrl ? (
                <img src={originalUrl} alt="Original" className="h-auto w-full object-contain" />
              ) : (
                <div className="aspect-video" />
              )}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Mejorada
            </p>
            <div className="relative overflow-hidden rounded-xl border border-primary/40 bg-background">
              {resultUrl ? (
                <img src={resultUrl} alt="Mejorada" className="h-auto w-full object-contain" />
              ) : (
                <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Procesando con IA...
                    </span>
                  ) : (
                    "Esperando resultado"
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
