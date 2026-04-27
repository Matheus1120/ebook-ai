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

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const title = String(body?.title || "").trim();

    if (!title) {
      return NextResponse.json({ error: "Título é obrigatório" }, { status: 400 });
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

    const { data: created, error: insErr } = await supabase
      .from("ebooks")
      .insert({ title, user_id: userData.user.id })
      .select("id, title, user_id, created_at, content")
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, ebook: created }, { status: 200 });
  } catch (err: any) {
    console.error("❌ ERRO /api/ebooks/create:", err);
    return NextResponse.json(
      { error: err?.message || "Erro desconhecido" },
      { status: 500 }
    );
  }
}
