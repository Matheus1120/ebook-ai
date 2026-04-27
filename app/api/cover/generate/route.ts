import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error("Missing env " + name);
  return v;
}

function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || null;
}

function cleanText(input: string, max = 120) {
  return (input || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export async function POST(req: Request) {
  try {
    const token = getBearer(req);
    if (!token) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const title = cleanText(String(body?.title || ""), 120);
    const topic = cleanText(String(body?.topic || ""), 180);
    const style = cleanText(String(body?.style || ""), 80);
    const extra = cleanText(String(body?.extra || ""), 160);

    if (!title) {
      return NextResponse.json({ error: "title é obrigatório" }, { status: 400 });
    }

    const client = new OpenAI({
      apiKey: mustEnv("OPENAI_API_KEY"),
    });

    const visualStyle = style || "Clean (tipo Kindle)";

    const prompt =
      "Crie uma capa vertical premium de eBook. " +
      "O título deve aparecer exatamente assim: " + title + ". " +
      "Não escreva nenhuma outra frase, assinatura, watermark, logo, selo ou texto pequeno. " +
      "Não escreva 'Gerado com IA'. " +
      "Composição limpa, profissional, legível, alto contraste, centralizada, estética editorial premium. " +
      "Tema visual: " + (topic || "livro motivacional/reflexivo") + ". " +
      "Estilo visual: " + visualStyle + ". " +
      "Detalhes opcionais: " + (extra || "sem detalhes extras") + ". " +
      "A imagem deve parecer capa real de livro digital, bonita e moderna.";

    const img = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1536",
    });

    const b64 = img.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ error: "Falha ao gerar imagem" }, { status: 500 });
    }

    const dataUrl = "data:image/png;base64," + b64;

    return NextResponse.json({
      ok: true,
      dataUrl,
    });
  } catch (err: any) {
    console.error("COVER GENERATE ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Erro ao gerar capa" },
      { status: 500 }
    );
  }
}