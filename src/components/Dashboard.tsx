import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ImageConverter } from "@/components/ImageConverter";
import { UrlImageExtractor } from "@/components/UrlImageExtractor";
import { MejorarCalidadImg } from "@/components/MejorarCalidadImg";
import { ChatsImg } from "@/components/ChatsImg";
import logoRoyal from "@/assets/logo-royal.png";
import {
  Download,
  ExternalLink,
  Image as ImageIcon,
  Link as LinkIcon,
  Puzzle,
  Sparkles,
  Wand2,
} from "lucide-react";

type SectionKey = "convert" | "url" | "enhance" | "generate" | "extension";

const items: { key: SectionKey; title: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "convert", title: "Convertir / Comprimir", icon: ImageIcon },
  { key: "url", title: "Extraer desde URL", icon: LinkIcon },
  { key: "enhance", title: "Mejorar calidad IA", icon: Sparkles },
  { key: "generate", title: "Generar imagen IA", icon: Wand2 },
  { key: "extension", title: "Extensión Chrome", icon: Puzzle },
];

function ExtensionView() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <Puzzle className="mx-auto mb-4 h-12 w-12 text-primary" />
      <h2 className="text-3xl font-bold text-foreground">Gallery Extractor Right</h2>
      <p className="mt-3 text-muted-foreground">
        Extensión de Chrome para extraer imágenes de cualquier galería web.
      </p>
      <Button
        type="button"
        size="lg"
        className="mt-6 rounded-full gap-2"
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
      >
        <Download className="h-4 w-4" /> Descargar extensión
      </Button>
    </div>
  );
}

export function Dashboard() {
  const [section, setSection] = useState<SectionKey>("convert");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full" style={{ background: "var(--gradient-soft)" }}>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-2">
              <img src={logoRoyal} alt="Logo" className="h-9 w-9 rounded-full object-contain" />
              <span className="font-semibold text-sidebar-foreground truncate">
                Image Converter
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Herramientas</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        isActive={section === item.key}
                        onClick={() => setSection(item.key)}
                        tooltip={item.title}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Más</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Ordenar imágenes">
                      <a
                        href="https://orderimgdirkz.lovable.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span>Ordenar imágenes</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="px-2">
              <ThemeToggle />
            </div>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b bg-background/60 backdrop-blur px-3 gap-2 sticky top-0 z-10">
            <SidebarTrigger />
            <span className="text-sm font-medium text-foreground">
              {items.find((i) => i.key === section)?.title ?? "Dashboard"}
            </span>
          </header>
          <main className="flex-1">
            {section === "convert" && <ImageConverter />}
            {section === "url" && (
              <div className="mx-auto max-w-5xl px-6 py-10">
                <UrlImageExtractor />
              </div>
            )}
            {section === "enhance" && (
              <div className="mx-auto max-w-5xl px-6 py-10">
                <MejorarCalidadImg />
              </div>
            )}
            {section === "generate" && (
              <div className="mx-auto max-w-5xl px-6 py-10">
                <ChatsImg />
              </div>
            )}
            {section === "extension" && <ExtensionView />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
