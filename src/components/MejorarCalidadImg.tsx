import { useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Sparkles, Upload, Download, Loader2, Trash2, FolderOpen, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { enhanceImage } from "@/lib/enhanceImage.functions";

type ChatMsg = { role: "user" | "ai"; text: string };

type ResultItem = {
  id: string;
  name: string;
  originalUrl: string;
  resultUrl: string | null;
  status: "pending" | "loading" | "done" | "error";
  error?: string;
};

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
  const folderRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ResultItem[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const pushChat = (m: ChatMsg) => setChat((c) => [...c, m]);

  const processFiles = useCallback(
    async (files: File[]) => {
      const imgs = files.filter((f) => f.type.startsWith("image/") && f.size <= 8 * 1024 * 1024);
      if (imgs.length === 0) {
        toast.error("No hay imágenes válidas (máx. 8 MB cada una)");
        return;
      }
      if (imgs.length < files.length) {
        toast.warning(`${files.length - imgs.length} archivo(s) ignorados (no son imagen o >8MB)`);
      }

      const newItems: ResultItem[] = imgs.map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: f.name,
        originalUrl: URL.createObjectURL(f),
        resultUrl: null,
        status: "pending",
      }));
      setItems((prev) => [...prev, ...newItems]);
      pushChat({ role: "user", text: `Subí ${imgs.length} imagen(es) para mejorar.` });
      setBusy(true);

      for (let i = 0; i < imgs.length; i++) {
        const f = imgs[i];
        const item = newItems[i];
        setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: "loading" } : p)));
        try {
          const { base64, mime } = await fileToBase64(f);
          const { imageUrl, notes } = await callEnhance({
            data: { imageBase64: base64, mimeType: mime },
          });
          setItems((prev) =>
            prev.map((p) =>
              p.id === item.id ? { ...p, resultUrl: imageUrl, status: "done" } : p
            )
          );
          pushChat({
            role: "ai",
            text: `✨ ${f.name}\n${notes || "Imagen mejorada: nitidez, color y detalles optimizados."}`,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error";
          setItems((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, status: "error", error: msg } : p))
          );
          pushChat({ role: "ai", text: `❌ ${f.name}: ${msg}` });
        }
      }
      setBusy(false);
      toast.success("Procesamiento completado");
    },
    [callEnhance]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files: File[] = [];
    const items = e.dataTransfer.items;
    if (items && items.length) {
      for (let i = 0; i < items.length; i++) {
        const f = items[i].getAsFile();
        if (f) files.push(f);
      }
    } else {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        files.push(e.dataTransfer.files[i]);
      }
    }
    if (files.length) void processFiles(files);
  };

  const downloadOne = (item: ResultItem) => {
    if (!item.resultUrl) return;
    const a = document.createElement("a");
    a.href = item.resultUrl;
    a.download = `${item.name.replace(/\.[^.]+$/, "")}_mejorada.png`;
    a.click();
  };

  const clearAll = () => {
    items.forEach((it) => URL.revokeObjectURL(it.originalUrl));
    setItems([]);
    setChat([]);
    toast.success("Todo limpio");
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
          Sube imágenes, carpetas completas o arrástralas. La IA mejora nitidez, color y detalles sin recortar.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        multiple
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []);
          if (fs.length) void processFiles(fs);
          e.target.value = "";
        }}
      />
      <input
        ref={folderRef}
        type="file"
        accept="image/*"
        hidden
        multiple
        // @ts-expect-error non-standard but widely supported
        webkitdirectory=""
        directory=""
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? []);
          if (fs.length) void processFiles(fs);
          e.target.value = "";
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${
          dragOver
            ? "border-primary bg-primary/10"
            : "border-border bg-background/40"
        }`}
      >
        <p className="text-sm text-muted-foreground">
          Arrastra y suelta imágenes aquí, o usa los botones
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Button onClick={() => inputRef.current?.click()} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Subir imágenes
          </Button>
          <Button
            onClick={() => folderRef.current?.click()}
            disabled={busy}
            variant="secondary"
            className="gap-2"
          >
            <FolderOpen className="h-4 w-4" /> Subir carpeta
          </Button>
          <Button onClick={clearAll} variant="outline" disabled={busy} className="gap-2">
            <Trash2 className="h-4 w-4" /> Limpiar
          </Button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="mt-6 space-y-6">
          {items.map((it) => (
            <div key={it.id} className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Original — {it.name}
                </p>
                <div className="overflow-hidden rounded-xl border border-border bg-background">
                  <img src={it.originalUrl} alt="Original" className="h-auto w-full object-contain" />
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Mejorada
                  </p>
                  {it.status === "done" && (
                    <Button size="sm" variant="ghost" onClick={() => downloadOne(it)} className="gap-1">
                      <Download className="h-3 w-3" /> Descargar
                    </Button>
                  )}
                </div>
                <div className="relative overflow-hidden rounded-xl border border-primary/40 bg-background">
                  {it.resultUrl ? (
                    <img src={it.resultUrl} alt="Mejorada" className="h-auto w-full object-contain" />
                  ) : (
                    <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
                      {it.status === "loading" ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Procesando...
                        </span>
                      ) : it.status === "error" ? (
                        <span className="text-destructive">{it.error}</span>
                      ) : (
                        "En cola"
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {chat.length > 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-background/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Mejoras realizadas</h3>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-2">
            {chat.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "ml-auto max-w-[80%] bg-primary/20 text-foreground"
                    : "mr-auto max-w-[90%] bg-card border border-border text-foreground"
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
