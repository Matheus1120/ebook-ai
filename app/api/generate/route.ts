import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Body = {
  ebookId: string;
  title: string;
  topic?: string | null;
  audience?: string | null;
  tone?: string | null;
  mode?: "capitulos" | "sem" | string | null;
  chapters?: number | null;
};

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável ${name} faltando no .env.local`);
  return v;
}

function getBearerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = (await req.json()) as Body;

    const ebookId = (body.ebookId || "").trim();
    const title = (body.title || "").trim();

    if (!ebookId) return NextResponse.json({ error: "ebookId é obrigatório" }, { status: 400 });
    if (!title) return NextResponse.json({ error: "Título é obrigatório" }, { status: 400 });

    const OPENAI_API_KEY = mustEnv("OPENAI_API_KEY");
    const SUPABASE_URL = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
    const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const topic = (body.topic || "").trim();
    const audience = (body.audience || "").trim();
    const tone = (body.tone || "").trim();
    const mode = (body.mode || "capitulos") as string;
    const chapters = Math.max(1, Number(body.chapters || 1));

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // usuário do token
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // ebook
    const { data: ebook, error: ebookErr } = await supabase
      .from("ebooks")
      .select("id,user_id,title,content")
      .eq("id", ebookId)
      .single();

    if (ebookErr || !ebook) return NextResponse.json({ error: "eBook não encontrado" }, { status: 404 });
    if (ebook.user_id !== userData.user.id) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const prompt = `
Você é um escritor profissional. Gere um eBook em **Markdown** (bem formatado).

Dados:
- Título: ${title}
- Tema: ${topic || "não informado"}
- Público-alvo: ${audience || "não informado"}
- Tom de voz: ${tone || "neutro"}
- Formato: ${mode === "capitulos" ? `Com capítulos (${chapters})` : "Sem capítulos"}

Regras:
- Sempre começar com "# ${title}"
- Depois "## Introdução"
- Se for "capitulos", gere capítulos:
  - "## Capítulo 1: ..."
  - "### 1.1 ..."
  - "### 1.2 ..."
- Conteúdo útil, prático e bem estruturado.
- Não use HTML, apenas Markdown.
`.trim();

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: "Você escreve eBooks em Markdown, didáticos e úteis." },
        { role: "user", content: prompt },
      ],
    });

    const markdown = completion.choices?.[0]?.message?.content?.trim() || "";
    if (!markdown) {
      return NextResponse.json({ error: "Resposta vazia da IA" }, { status: 500 });
    }

    const { error: upErr } = await supabase.from("ebooks").update({ content: markdown }).eq("id", ebookId);
    if (upErr) {
      return NextResponse.json({ error: "Falha ao salvar no Supabase", details: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, markdown }, { status: 200 });
  } catch (err: any) {
    console.error("❌ ERRO /api/generate:", err);
    return NextResponse.json({ error: err?.message || "Erro desconhecido" }, { status: 500 });
  }
}
