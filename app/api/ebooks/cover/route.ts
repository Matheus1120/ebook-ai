import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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

// aceita só imagens dataURL (png/jpg/webp)
function validateDataUrl(dataUrl: string) {
  const m = dataUrl.match(/^data:(image\/png|image\/jpeg|image\/webp);base64,(.+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const b64 = m[2];
  // limite ~1.5MB base64 (ajusta se quiser)
  if (b64.length > 2_000_000) return null;
  return { mime, b64 };
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const ebookId = String(body?.ebookId || "").trim();
    const coverData = String(body?.coverData || "").trim();

    if (!ebookId) return NextResponse.json({ error: "ebookId é obrigatório" }, { status: 400 });
    if (!coverData) return NextResponse.json({ error: "coverData é obrigatório" }, { status: 400 });

    const parsed = validateDataUrl(coverData);
    if (!parsed) {
      return NextResponse.json(
        { error: "Capa inválida. Envie PNG/JPG/WEBP em dataURL (base64) e até ~1.5MB." },
        { status: 400 }
      );
    }

    const SUPABASE_URL = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
    const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // verifica dono do ebook
    const { data: ebook, error: ebookErr } = await supabase
      .from("ebooks")
      .select("id, user_id")
      .eq("id", ebookId)
      .single();

    if (ebookErr || !ebook) return NextResponse.json({ error: "eBook não encontrado" }, { status: 404 });
    if (ebook.user_id !== userData.user.id) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    // salva capa
    const { error: upErr } = await supabase
      .from("ebooks")
      .update({ cover_data: coverData })
      .eq("id", ebookId);

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("❌ ERRO /api/ebooks/cover:", err);
    return NextResponse.json({ error: err?.message || "Erro desconhecido" }, { status: 500 });
  }
}
