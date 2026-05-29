import { useRef, useState } from "react";
import { createParser } from "eventsource-parser";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Download, Trash2, Wand2, ImageIcon } from "lucide-react";
import { toast } from "sonner";

type ChatMsg = {
  id: string;
  role: "user" | "ai";
  text?: string;
  imageUrl?: string;
  isFinal?: boolean;
};

type EventPayload = {
  b64_json: string;
  partial_image_index?: number;
};

export function ChatsImg() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addMsg = (m: ChatMsg) => {
    setMessages((prev) => [...prev, m]);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  const updateMsg = (id: string, patch: Partial<ChatMsg>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const generate = async () => {
    const p = prompt.trim();
    if (!p || busy) return;
    setPrompt("");
    setBusy(true);

    addMsg({ id: `u-${Date.now()}`, role: "user", text: p });
    const aiId = `a-${Date.now()}`;
    addMsg({ id: aiId, role: "ai", text: "Generando imagen…" });

    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      });
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Error ${res.status}`);
      }

      let sawFinal = false;
      const parser = createParser({
        onEvent(event) {
          if (
            event.event !== "image_generation.partial_image" &&
            event.event !== "image_generation.completed"
          )
            return;
          let payload: EventPayload;
          try {
            payload = JSON.parse(event.data) as EventPayload;
          } catch {
            return;
          }
          const isFinal = event.event === "image_generation.completed";
          flushSync(() => {
            updateMsg(aiId, {
              imageUrl: `data:image/png;base64,${payload.b64_json}`,
              isFinal,
              text: isFinal ? "Imagen generada ✨" : "Renderizando…",
            });
          });
          if (isFinal) sawFinal = true;
        },
      });

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.feed(value);
      }
      if (!sawFinal) throw new Error("La generación terminó sin imagen final");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      updateMsg(aiId, { text: `❌ ${msg}` });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const download = (m: ChatMsg) => {
    if (!m.imageUrl) return;
    const a = document.createElement("a");
    a.href = m.imageUrl;
    a.download = `generada-${m.id}.png`;
    a.click();
  };

  const clearAll = () => {
    setMessages([]);
    setPrompt("");
    toast.success("Chat limpio");
  };

  return (
    <section
      className="rounded-3xl border border-border bg-card p-6 md:p-8"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground">Generar imágenes con IA</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Escribe lo que quieres ver y la IA lo dibuja. Streaming en tiempo real.
          </p>
        </div>
        <Button onClick={clearAll} variant="outline" size="sm" className="gap-2" disabled={busy}>
          <Trash2 className="h-4 w-4" /> Limpiar
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="mb-4 max-h-[60vh] min-h-[300px] space-y-4 overflow-y-auto rounded-2xl border border-border bg-background/50 p-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <ImageIcon className="mb-2 h-10 w-10 opacity-40" />
            <p>Empieza escribiendo un prompt abajo.</p>
            <p className="mt-1 text-xs">
              Ej: "un astronauta surfeando una ola cósmica, estilo acuarela"
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[80%] rounded-2xl bg-primary/20 px-4 py-2 text-sm text-foreground"
                  : "mr-auto max-w-[90%] space-y-2"
              }
            >
              {m.text && (
                <p
                  className={
                    m.role === "ai"
                      ? "rounded-2xl border border-border bg-card px-4 py-2 text-sm text-foreground"
                      : "whitespace-pre-wrap"
                  }
                >
                  {m.text}
                </p>
              )}
              {m.imageUrl && (
                <div className="overflow-hidden rounded-xl border border-primary/40">
                  <img
                    src={m.imageUrl}
                    alt="Imagen generada"
                    className={`h-auto w-full object-contain transition-[filter] duration-300 ${
                      m.isFinal ? "blur-0" : "blur-md"
                    }`}
                  />
                  {m.isFinal && (
                    <div className="flex justify-end border-t border-border bg-background/60 p-2">
                      <Button size="sm" variant="ghost" onClick={() => download(m)} className="gap-1">
                        <Download className="h-3 w-3" /> Descargar
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
        className="flex gap-2"
      >
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe la imagen que quieres generar…"
          disabled={busy}
          className="flex-1"
        />
        <Button type="submit" disabled={busy || !prompt.trim()} className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Generar
        </Button>
      </form>
    </section>
  );
}
