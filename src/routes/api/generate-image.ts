import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt } = (await request.json()) as { prompt?: string };
        if (!prompt || typeof prompt !== "string" || prompt.length < 1) {
          return new Response("Prompt requerido", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("LOVABLE_API_KEY no configurado", { status: 500 });

        const upstream = await fetch(
          "https://ai.gateway.lovable.dev/v1/images/generations",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-image-2",
              prompt,
              quality: "low",
              size: "1024x1024",
              n: 1,
              stream: true,
              partial_images: 2,
            }),
            signal: request.signal,
          },
        );

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          if (upstream.status === 402) {
            return new Response(
              "Créditos de IA agotados: ya se usó el saldo gratis de IA de este mes (4 créditos). " +
                "En plan Free no se pueden comprar créditos; necesitas un plan de pago " +
                "(Workspace settings → Plans & credit usage) o esperar a que el saldo gratis se renueve " +
                "el 1 de diciembre a las 00:00 UTC (18:00 de Managua del 30 de noviembre).",
              { status: 402 },
            );
          }
          if (upstream.status === 429) {
            return new Response("Límite de uso alcanzado. Intenta en unos minutos.", {
              status: 429,
            });
          }
          return new Response(text || "Error generando imagen", {
            status: upstream.status,
          });
        }
        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
