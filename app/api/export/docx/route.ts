import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } from "docx";

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

function stripMd(line: string) {
  return line.replace(/\*\*(.+?)\*\*/g, "$1").trim();
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const m = dataUrl.match(/^data:(image\/png|image\/jpeg|image\/webp);base64,(.+)$/i);
  if (!m) return null;
  return Buffer.from(m[2], "base64");
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const ebookId = body?.ebookId as string | undefined;
    const coverDataUrl = (body?.coverDataUrl as string | null) || null;

    if (!ebookId) return NextResponse.json({ error: "ebookId não informado" }, { status: 400 });

    const SUPABASE_URL = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
    const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { data: ebook, error: ebookErr } = await supabase
      .from("ebooks")
      .select("id,user_id,title,content")
      .eq("id", ebookId)
      .single();

    if (ebookErr || !ebook) return NextResponse.json({ error: "eBook não encontrado" }, { status: 404 });
    if (ebook.user_id !== userData.user.id) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    if (!ebook.title || !ebook.content)
      return NextResponse.json({ error: "Conteúdo ou título não informado" }, { status: 400 });

    const safeTitle = String(ebook.title).replace(/[^\w\-]+/g, "_").slice(0, 80) || "ebook";
    const md = String(ebook.content);

    const children: Paragraph[] = [];

    // capa (opcional)
    if (coverDataUrl) {
      const buf = dataUrlToBuffer(coverDataUrl);
      if (buf) {
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: buf,
                transformation: { width: 380, height: 520 },
              }),
            ],
          })
        );
        children.push(new Paragraph({ text: "" }));
      }
    }

    // título
    children.push(
      new Paragraph({
        text: String(ebook.title),
        heading: HeadingLevel.TITLE,
      })
    );
    children.push(new Paragraph({ text: "" }));

    // markdown simples -> docx
    for (const raw of md.split("\n")) {
      const line = raw.trimEnd();
      if (!line.trim()) {
        children.push(new Paragraph({ text: "" }));
        continue;
      }

      if (line.startsWith("# ")) continue; // já usamos o título

      if (line.startsWith("## ")) {
        children.push(
          new Paragraph({
            text: stripMd(line.replace(/^##\s+/, "")),
            heading: HeadingLevel.HEADING_1,
          })
        );
        continue;
      }

      if (line.startsWith("### ")) {
        children.push(
          new Paragraph({
            text: stripMd(line.replace(/^###\s+/, "")),
            heading: HeadingLevel.HEADING_2,
          })
        );
        continue;
      }

      if (/^[-*]\s+/.test(line)) {
        children.push(
          new Paragraph({
            text: stripMd(line.replace(/^[-*]\s+/, "")),
            bullet: { level: 0 },
          })
        );
        continue;
      }

      // parágrafo (bold simples)
      const parts: (TextRun | string)[] = [];
      const chunks = line.split(/(\*\*.+?\*\*)/g).filter(Boolean);
      for (const c of chunks) {
        const mm = c.match(/^\*\*(.+)\*\*$/);
        if (mm) {
          parts.push(new TextRun({ text: mm[1], bold: true }));
        } else {
          parts.push(new TextRun({ text: c }));
        }
      }

      children.push(new Paragraph({ children: parts as TextRun[] }));
    }

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeTitle}.docx"`,
      },
    });
  } catch (err: any) {
    console.error("❌ ERRO /api/export/docx:", err);
    return NextResponse.json({ error: err?.message || "Erro desconhecido" }, { status: 500 });
  }
}
