import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  Download,
  RotateCcw,
  Trash2,
  Upload,
  Wand2,
  CircleDot,
} from "lucide-react";
import { toast } from "sonner";

type DotShape = "dot" | "line";
type Ratio = "1:1" | "3:4" | "4:3" | "16:9" | "9:16";
type Tab = "original" | "preview" | "export";

type State = {
  knockoutEnabled: boolean;
  knockoutColor: string;
  bgColor: string;
  dotShape: DotShape;
  dotSize: number;
  dotAngle: number;
  ratio: Ratio;
  exportDpi: 300 | 450 | 600;
  blur: number;
  gamma: number;
  gradientIntensity: number;
  contrast: number;
  brightness: number;
};

const DEFAULT_STATE: State = {
  knockoutEnabled: true,
  knockoutColor: "#000000",
  bgColor: "#ffffff",
  dotShape: "dot",
  dotSize: 10,
  dotAngle: 45,
  ratio: "1:1",
  exportDpi: 300,
  blur: 0,
  gamma: 1,
  gradientIntensity: 0.3,
  contrast: 1,
  brightness: 0,
};

const RATIOS: Record<Ratio, [number, number]> = {
  "1:1": [1, 1],
  "3:4": [3, 4],
  "4:3": [4, 3],
  "16:9": [16, 9],
  "9:16": [9, 16],
};

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function SemitonoAi() {
  const [state, setState] = useState<State>(DEFAULT_STATE);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("preview");
  const [prompt, setPrompt] = useState("");
  const [busyAi, setBusyAi] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLCanvasElement>(null);

  const set = <K extends keyof State>(k: K, v: State[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  // Load image element
  useEffect(() => {
    if (!imgUrl) {
      imgRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      render();
    };
    img.src = imgUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgUrl]);

  const render = useCallback(
    (target?: HTMLCanvasElement, scale = 1) => {
      const canvas = target ?? canvasRef.current;
      const img = imgRef.current;
      if (!canvas || !img) return;

      const [rw, rh] = RATIOS[state.ratio];
      // Base preview size
      const baseW = 800 * scale;
      const baseH = Math.round((baseW * rh) / rw);
      canvas.width = baseW;
      canvas.height = baseH;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Background
      ctx.fillStyle = state.bgColor;
      ctx.fillRect(0, 0, baseW, baseH);

      // Fit image (cover)
      const ir = img.width / img.height;
      const cr = baseW / baseH;
      let dw, dh;
      if (ir > cr) {
        dh = baseH;
        dw = dh * ir;
      } else {
        dw = baseW;
        dh = dw / ir;
      }
      const dx = (baseW - dw) / 2;
      const dy = (baseH - dh) / 2;

      // Offscreen for pre-processing
      const off = document.createElement("canvas");
      off.width = baseW;
      off.height = baseH;
      const octx = off.getContext("2d");
      if (!octx) return;
      if (state.blur > 0) octx.filter = `blur(${state.blur}px)`;
      octx.drawImage(img, dx, dy, dw, dh);
      octx.filter = "none";

      const imageData = octx.getImageData(0, 0, baseW, baseH);
      const data = imageData.data;
      const { gamma, contrast, brightness, gradientIntensity } = state;
      const brightness255 = brightness * 255;
      // Compute luminance map
      const lum = new Float32Array(baseW * baseH);
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        let r = data[i] / 255;
        let g = data[i + 1] / 255;
        let b = data[i + 2] / 255;
        // gamma
        r = Math.pow(r, 1 / gamma);
        g = Math.pow(g, 1 / gamma);
        b = Math.pow(b, 1 / gamma);
        let l = 0.299 * r + 0.587 * g + 0.114 * b;
        // contrast around 0.5
        l = (l - 0.5) * contrast + 0.5;
        // brightness
        l += brightness;
        // gradient intensity (push midtones)
        l = l * (1 - gradientIntensity) + Math.round(l) * gradientIntensity;
        lum[p] = Math.max(0, Math.min(1, l));
      }

      // Draw halftone
      const knock = hexToRgb(state.knockoutColor);
      ctx.fillStyle = `rgb(${knock[0]}, ${knock[1]}, ${knock[2]})`;

      const cell = Math.max(2, state.dotSize);
      const angle = (state.dotAngle * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // Iterate in rotated grid
      const diag = Math.ceil(Math.sqrt(baseW * baseW + baseH * baseH));
      const half = diag / 2;
      const cx = baseW / 2;
      const cy = baseH / 2;

      ctx.save();
      for (let gy = -half; gy < half; gy += cell) {
        for (let gx = -half; gx < half; gx += cell) {
          // Rotate grid point back to image coords
          const px = cx + gx * cos - gy * sin;
          const py = cy + gx * sin + gy * cos;
          const ix = Math.round(px);
          const iy = Math.round(py);
          if (ix < 0 || iy < 0 || ix >= baseW || iy >= baseH) continue;
          const l = lum[iy * baseW + ix];
          // darker => bigger dot. knockout color is the ink.
          const intensity = state.knockoutEnabled ? 1 - l : l;
          if (intensity <= 0.02) continue;

          if (state.dotShape === "dot") {
            const r = (cell / 2) * Math.sqrt(intensity);
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // line
            const len = cell;
            const thick = Math.max(0.5, cell * 0.5 * intensity);
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(angle);
            ctx.fillRect(-len / 2, -thick / 2, len, thick);
            ctx.restore();
          }
        }
      }
      ctx.restore();

      // suppress unused warnings
      void brightness255;
    },
    [state],
  );

  useEffect(() => {
    render();
  }, [render]);

  const onUpload = (file: File) => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    setTab("preview");
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!f.type.startsWith("image/")) {
      toast.error("Solo imágenes");
      return;
    }
    onUpload(f);
  };

  const reset = () => {
    setState(DEFAULT_STATE);
    toast.success("Ajustes restablecidos");
  };

  const remove = () => {
    setImgUrl(null);
    imgRef.current = null;
    const c = canvasRef.current;
    if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
  };

  const exportImage = () => {
    if (!imgRef.current) {
      toast.error("Sube una imagen primero");
      return;
    }
    const scale = state.exportDpi / 150; // 150 base
    const c = exportRef.current ?? document.createElement("canvas");
    render(c, scale);
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `semitono-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Imagen exportada");
    }, "image/png");
  };

  const generateAi = async () => {
    const p = prompt.trim();
    if (!p) return;
    setBusyAi(true);
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
      // Read whole stream, take the last b64 (final frame)
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      let lastB64: string | null = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          const dataLine = ev
            .split("\n")
            .find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          try {
            const json = JSON.parse(dataLine.slice(5).trim()) as {
              b64_json?: string;
            };
            if (json.b64_json) lastB64 = json.b64_json;
          } catch {
            /* ignore */
          }
        }
      }
      if (!lastB64) throw new Error("Sin imagen");
      setImgUrl(`data:image/png;base64,${lastB64}`);
      toast.success("Imagen generada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setBusyAi(false);
    }
  };

  const previewSrc = useMemo(() => imgUrl, [imgUrl]);

  return (
    <section
      className="rounded-3xl border border-border bg-card p-4 md:p-6"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="mb-4 flex items-center gap-2">
        <CircleDot className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold text-foreground">Semitono AI</h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr_300px]">
        {/* LEFT: AI generator + upload */}
        <div className="space-y-4 rounded-2xl border border-border bg-background/50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Wand2 className="h-4 w-4 text-primary" /> AI GENERATOR
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Prompt
            </Label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe la imagen que quieres generar…"
              className="min-h-[100px] w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm"
              disabled={busyAi}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Ratio
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(RATIOS) as Ratio[]).map((r) => (
                <Button
                  key={r}
                  type="button"
                  size="sm"
                  variant={state.ratio === r ? "default" : "outline"}
                  onClick={() => set("ratio", r)}
                  className="h-8 text-xs"
                >
                  {r}
                </Button>
              ))}
            </div>
          </div>

          <Button
            onClick={generateAi}
            disabled={busyAi || !prompt.trim()}
            className="w-full gap-2"
          >
            <Wand2 className="h-4 w-4" />
            {busyAi ? "Generando…" : "Generate"}
          </Button>

          <div className="border-t border-border pt-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> Subir imagen
            </Button>
          </div>
        </div>

        {/* CENTER: Preview */}
        <div className="rounded-2xl border border-border bg-background/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="inline-flex rounded-full border border-border bg-card p-1">
              {(["original", "preview", "export"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-4 py-1 text-xs font-medium capitalize transition ${
                    tab === t
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                Replace
              </Button>
              <Button size="sm" variant="outline" onClick={remove}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div className="flex min-h-[400px] items-center justify-center overflow-hidden rounded-xl bg-muted/30 p-2">
            {!imgUrl ? (
              <div className="text-center text-sm text-muted-foreground">
                <Upload className="mx-auto mb-2 h-10 w-10 opacity-40" />
                <p>Sube o genera una imagen para empezar</p>
              </div>
            ) : tab === "original" ? (
              <img
                src={previewSrc ?? ""}
                alt="original"
                className="max-h-[60vh] w-auto object-contain"
              />
            ) : (
              <canvas
                ref={canvasRef}
                className="max-h-[60vh] w-auto max-w-full object-contain"
              />
            )}
          </div>

          {tab === "export" && (
            <div className="mt-4 flex justify-center">
              <Button onClick={exportImage} className="gap-2">
                <Download className="h-4 w-4" /> Exportar PNG ({state.exportDpi}{" "}
                DPI)
              </Button>
            </div>
          )}
          <canvas ref={exportRef} className="hidden" />
        </div>

        {/* RIGHT: Controls */}
        <div className="space-y-3 rounded-2xl border border-border bg-background/50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              Ajustes
            </span>
            <Button size="sm" variant="ghost" onClick={reset} className="gap-1">
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
          </div>

          {/* COLOR */}
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide">
                Color
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <Label>Knockout Color</Label>
              <Switch
                checked={state.knockoutEnabled}
                onCheckedChange={(v) => set("knockoutEnabled", v)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={state.knockoutColor}
                onChange={(e) => set("knockoutColor", e.target.value)}
                className="h-8 w-12 p-1"
              />
              <Input
                value={state.knockoutColor}
                onChange={(e) => set("knockoutColor", e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <Label className="text-xs">BG Color</Label>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={state.bgColor}
                onChange={(e) => set("bgColor", e.target.value)}
                className="h-8 w-12 p-1"
              />
              <Input
                value={state.bgColor}
                onChange={(e) => set("bgColor", e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* HALFTONE */}
          <div className="space-y-3 rounded-lg border border-border p-3">
            <span className="text-xs font-semibold uppercase tracking-wide">
              Halftone Pattern
            </span>
            <div className="space-y-1">
              <Label className="text-xs">Dot Shape</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant={state.dotShape === "dot" ? "default" : "outline"}
                  onClick={() => set("dotShape", "dot")}
                >
                  ● Dot
                </Button>
                <Button
                  size="sm"
                  variant={state.dotShape === "line" ? "default" : "outline"}
                  onClick={() => set("dotShape", "line")}
                >
                  ╱ Line
                </Button>
              </div>
            </div>
            <SliderRow
              label="Dot Size"
              value={state.dotSize}
              suffix=" px"
              min={2}
              max={40}
              step={0.5}
              onChange={(v) => set("dotSize", v)}
            />
            <SliderRow
              label="Dot Angle"
              value={state.dotAngle}
              suffix=" °"
              min={0}
              max={180}
              step={1}
              onChange={(v) => set("dotAngle", v)}
            />
          </div>

          {/* SIZE / DPI */}
          <div className="space-y-2 rounded-lg border border-border p-3">
            <span className="text-xs font-semibold uppercase tracking-wide">
              Size Settings
            </span>
            <Label className="text-xs">Export DPI</Label>
            <div className="grid grid-cols-3 gap-2">
              {[300, 450, 600].map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={state.exportDpi === d ? "default" : "outline"}
                  onClick={() => set("exportDpi", d as 300 | 450 | 600)}
                >
                  {d}
                </Button>
              ))}
            </div>
            <Label className="text-xs">Ratio</Label>
            <Select value={state.ratio} onValueChange={(v) => set("ratio", v as Ratio)}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RATIOS) as Ratio[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ADVANCED */}
          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-xs font-semibold uppercase tracking-wide">
              <span>Advanced</span>
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div className="space-y-3 rounded-lg border border-border p-3">
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Pre-processing
                </span>
                <SliderRow
                  label="Blur"
                  value={state.blur}
                  suffix=" px"
                  min={0}
                  max={10}
                  step={0.1}
                  onChange={(v) => set("blur", v)}
                />
                <SliderRow
                  label="Gamma"
                  value={state.gamma}
                  min={0.2}
                  max={3}
                  step={0.05}
                  onChange={(v) => set("gamma", v)}
                />
              </div>
              <div className="space-y-3 rounded-lg border border-border p-3">
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Tonal Balance
                </span>
                <SliderRow
                  label="Gradient Intensity"
                  value={state.gradientIntensity}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => set("gradientIntensity", v)}
                />
                <SliderRow
                  label="Contrast"
                  value={state.contrast}
                  min={0}
                  max={3}
                  step={0.05}
                  onChange={(v) => set("contrast", v)}
                />
                <SliderRow
                  label="Brightness"
                  value={state.brightness}
                  min={-0.5}
                  max={0.5}
                  step={0.01}
                  onChange={(v) => set("brightness", v)}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </section>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <Label>{label}</Label>
        <span className="tabular-nums text-muted-foreground">
          {value.toFixed(step < 1 ? 2 : 0)}
          {suffix}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}
