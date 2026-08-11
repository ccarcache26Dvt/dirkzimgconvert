import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { fetchSiteData, type SiteDataResult } from "@/lib/siteData.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Copy, Download, Loader2, Search } from "lucide-react";

type Anyish = Record<string, any>;

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="text-foreground break-all">{value}</span>
    </div>
  );
}

export function SiteDataApi() {
  const run = useServerFn(fetchSiteData);
  const [id, setId] = useState("68643fb55157c8ed0131837b");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SiteDataResult | null>(null);

  const data = (result?.data ?? null) as Anyish | null;
  const principal = (data?.["dbPrincipal"] ?? {}) as Anyish;
  const gallery = (data?.["gallery"] ?? []) as string[];
  const services = (data?.["dbServices"] ?? []) as Anyish[];
  const redes = ((data?.["dbSocialMedia"] as Anyish)?.["redes"] ?? []) as Anyish[];

  const search = async () => {
    if (!id.trim() && !url.trim()) {
      toast.error("Ingresa un ID o una URL");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await run({ data: { id: id.trim() || undefined, url: url.trim() || undefined } });
      setResult(res);
      if (res.error) toast.error(res.error);
      else
        toast.success(
          res.source === "api" ? "Data obtenida desde la API" : "Data extraída del sitio web",
        );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al consultar");
    } finally {
      setLoading(false);
    }
  };

  const json = data ? JSON.stringify(data, null, 2) : "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">API Request por ID</h2>
        <p className="text-sm text-muted-foreground">
          Consulta la data de un sitio por su ID. Si la API no devuelve nada, se extrae del sitio web.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">ID</label>
            <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="68643fb5..." />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              URL del sitio (fallback)
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://buitronpaintingca.com/"
            />
          </div>
        </div>
        <Button onClick={search} disabled={loading} className="gap-2 rounded-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Consultar
        </Button>
        {result?.notes?.length ? (
          <ul className="text-xs text-muted-foreground list-disc pl-5">
            {result.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        ) : null}
      </Card>

      {data && (
        <Tabs defaultValue="preview">
          <TabsList>
            <TabsTrigger value="preview">Vista previa</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="space-y-4 pt-4">
            <Card className="p-4 flex items-start gap-4">
              {principal["logo"] ? (
                <img
                  src={String(principal["logo"])}
                  alt={String(principal["name"] ?? "logo")}
                  className="h-16 w-16 rounded-lg object-contain bg-muted"
                />
              ) : null}
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">
                  {String(principal["name"] ?? "Sin nombre")}
                </h3>
                <Row label="Web" value={String(data["linkWeb"] ?? "")} />
                <Row
                  label="Teléfono"
                  value={((principal["phones"] as Anyish[]) ?? [])
                    .map((p) => p["phone"])
                    .join(", ")}
                />
                <Row
                  label="Email"
                  value={((principal["emails"] as Anyish[]) ?? []).map((p) => p["email"]).join(", ")}
                />
                <Row
                  label="Dirección"
                  value={((principal["location"] as Anyish[]) ?? [])
                    .map((p) => p["address"])
                    .filter(Boolean)
                    .join(", ")}
                />
              </div>
            </Card>

            {redes.length > 0 && (
              <Card className="p-4">
                <h4 className="mb-2 font-semibold text-foreground">Redes y directorios</h4>
                <div className="flex flex-wrap gap-2">
                  {redes.map((r, i) => (
                    <a
                      key={i}
                      href={String(r["url"])}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border px-3 py-1 text-xs hover:bg-accent"
                    >
                      {String(r["name"])}
                    </a>
                  ))}
                </div>
              </Card>
            )}

            {services.length > 0 && (
              <Card className="p-4">
                <h4 className="mb-2 font-semibold text-foreground">Servicios ({services.length})</h4>
                <ul className="grid gap-1 sm:grid-cols-2 text-sm text-muted-foreground">
                  {services.map((s, i) => (
                    <li key={i}>• {String(s["name"])}</li>
                  ))}
                </ul>
              </Card>
            )}

            {gallery.length > 0 && (
              <Card className="p-4">
                <h4 className="mb-2 font-semibold text-foreground">Galería ({gallery.length})</h4>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {gallery.slice(0, 20).map((g, i) => (
                    <img
                      key={i}
                      src={g}
                      alt={`img-${i}`}
                      loading="lazy"
                      className="aspect-square w-full rounded-md object-cover bg-muted"
                    />
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="json" className="pt-4 space-y-3">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  navigator.clipboard.writeText(json);
                  toast.success("JSON copiado");
                }}
              >
                <Copy className="h-4 w-4" /> Copiar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
                  a.download = `${id || "site"}.json`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                <Download className="h-4 w-4" /> Descargar
              </Button>
            </div>
            <pre className="max-h-[600px] overflow-auto rounded-lg bg-muted p-4 text-xs text-foreground">
              {json}
            </pre>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
