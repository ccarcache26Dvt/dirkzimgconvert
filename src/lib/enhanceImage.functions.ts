import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  imageBase64: z.string().min(20).max(20_000_000),
  mimeType: z.string().min(3).max(64),
  prompt: z.string().min(1).max(2000).optional(),
});

const DEFAULT_PROMPT =
  "Upscale and enhance this image to maximum quality WITHOUT cropping, zooming, reframing or changing the aspect ratio. Keep the EXACT same framing, composition, subject position and full content visible from edge to edge. Do not add borders. Remove pixelation, JPEG/compression artifacts and noise. Sharpen edges and vector strokes. Restore fine details, textures, hair, skin, and small text. Improve clarity, contrast, color balance and lighting naturally. Then, AFTER the image, write a short bullet list in Spanish (3-6 bullets) titled 'Mejoras aplicadas:' describing exactly what you improved (e.g. nitidez, ruido, color, detalles, iluminación, artefactos).";

type GatewayPart =
  | { type: "text"; text?: string }
  | { type?: string; image_url?: { url?: string } | string; url?: string; text?: string };

export const enhanceImage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY no configurado");

    const dataUrl = `data:${data.mimeType};base64,${data.imageBase64}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        modalities: ["image", "text"],
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: data.prompt ?? DEFAULT_PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Límite de uso alcanzado. Intenta en unos minutos.");
      if (res.status === 402) throw new Error("Créditos de IA agotados. Añade créditos en Settings → Workspace → Usage.");
      throw new Error(`Error IA (${res.status}): ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | GatewayPart[];
          images?: Array<{ image_url?: { url?: string } | string }>;
        };
      }>;
    };

    const msg = json.choices?.[0]?.message;
    let imageUrl: string | undefined;
    let notes = "";

    const imgs = msg?.images;
    if (Array.isArray(imgs)) {
      for (const it of imgs) {
        const v = typeof it.image_url === "string" ? it.image_url : it.image_url?.url;
        if (v?.startsWith("data:image")) {
          imageUrl = v;
          break;
        }
      }
    }

    if (typeof msg?.content === "string") {
      notes = msg.content;
    } else if (Array.isArray(msg?.content)) {
      for (const p of msg!.content as GatewayPart[]) {
        if (!imageUrl) {
          const v =
            typeof (p as { image_url?: unknown }).image_url === "string"
              ? ((p as { image_url: string }).image_url)
              : (p as { image_url?: { url?: string } }).image_url?.url ??
                (p as { url?: string }).url;
          if (typeof v === "string" && v.startsWith("data:image")) {
            imageUrl = v;
          }
        }
        if (typeof p.text === "string") notes += (notes ? "\n" : "") + p.text;
      }
    }

    if (!imageUrl) {
      throw new Error("La IA no devolvió una imagen. Intenta de nuevo.");
    }

    return { imageUrl, notes: notes.trim() };
  });
