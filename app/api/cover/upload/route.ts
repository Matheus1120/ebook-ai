import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function dataUrlToBytes(dataUrl: string) {
  const m = String(dataUrl || "").match(
    /^data:(image\/png|image\/jpeg|image\/jpg|image\/webp);base64,(.+)$/i
  );
  if (!m) return null;

  const mime = m[1].toLowerCase();
  const b64 = m[2];
  const bytes = Buffer.from(b64, "base64");

  return { mime, bytes };
}

export async function POST(req: Request) {
  try {
    const token = getBearer(req);
    if (!token) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const ebookId = String(body?.ebookId || "").trim();
    const dataUrl = String(body?.dataUrl || "").trim();

    if (!ebookId) {
      return NextResponse.json({ error: "ebookId é obrigatório" }, { status: 400 });
    }

    if (!dataUrl) {
      return NextResponse.json({ error: "dataUrl é obrigatório" }, { status: 400 });
    }

    const parsed = dataUrlToBytes(dataUrl);
    if (!parsed) {
      return NextResponse.json({ error: "Imagem inválida" }, { status: 400 });
    }

    const supabase = createClient(
      mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
      mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }

    const userId = userData.user.id;

    const { data: ebook, error: ebookErr } = await supabase
      .from("ebooks")
      .select("id, user_id")
      .eq("id", ebookId)
      .single();

    if (ebookErr || !ebook) {
      return NextResponse.json({ error: "eBook não encontrado" }, { status: 404 });
    }

    if (ebook.user_id && ebook.user_id !== userId) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const ext =
      parsed.mime.indexOf("png") >= 0
        ? "png"
        : parsed.mime.indexOf("webp") >= 0
        ? "webp"
        : "jpg";

    const filePath = userId + "/" + ebookId + "/cover." + ext;

    const { error: uploadErr } = await supabase.storage
      .from("covers")
      .upload(filePath, parsed.bytes, {
        contentType: parsed.mime,
        upsert: true,
      });

    if (uploadErr) {
      return NextResponse.json(
        { error: "Falha ao salvar capa no storage: " + uploadErr.message },
        { status: 500 }
      );
    }

    const { error: updateErr } = await supabase
      .from("ebooks")
      .update({ cover_path: filePath })
      .eq("id", ebookId);

    if (updateErr) {
      return NextResponse.json(
        { error: "Falha ao salvar cover_path: " + updateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      cover_path: filePath,
    });
  } catch (err: any) {
    console.error("COVER UPLOAD ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Erro ao enviar capa" },
      { status: 500 }
    );
  }
}