import { createFileRoute } from "@tanstack/react-router";
import { ImageConverter } from "@/components/ImageConverter";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Convertidor de Imágenes — JPG, PNG, HEIC, TIFF" },
      {
        name: "description",
        content:
          "Convierte imágenes y carpetas completas a JPG, PNG, WebP o TIFF directamente en tu navegador. Rápido y privado.",
      },
    ],
  }),
});

function Index() {
  return (
    <>
      <ImageConverter />
      <Toaster richColors position="top-center" />
    </>
  );
}
