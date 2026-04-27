import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
} from "docx";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error("Missing env " + name);
  return v;
}

function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function safeFileName(input: string) {
  return (input || "ebook")
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
}

function stripMd(text: string) {
  return String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .trim();
}

function isPng(bytes: Buffer) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

export async function POST(req: Request) {
  try {
    const token = getBearer(req);

    if (!token) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const ebookId = body?.ebookId as string | undefined;

    if (!ebookId) {
      return NextResponse.json(
        { error: "ebookId é obrigatório." },
        { status: 400 }
      );
    }

    const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseUser = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: "Bearer " + token,
        },
      },
    });

    const { data: userData, error: userErr } =
      await supabaseUser.auth.getUser();

    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Token inválido." }, { status: 401 });
    }

    const userId = userData.user.id;

    const { data: ebook, error: ebookErr } = await supabaseUser
      .from("ebooks")
      .select("id, title, content, cover_path, user_id")
      .eq("id", ebookId)
      .single();

    if (ebookErr || !ebook) {
      return NextResponse.json(
        { error: "eBook não encontrado." },
        { status: 404 }
      );
    }

    if (ebook.user_id && ebook.user_id !== userId) {
      return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
    }

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const title = String(ebook.title || "eBook").trim() || "eBook";
    const content =
      String(ebook.content || "Sem conteúdo.").replace(/\r\n/g, "\n") ||
      "Sem conteúdo.";

    const children: Paragraph[] = [];

    // CAPA
    if (ebook.cover_path) {
      const { data: coverFile } = await supabaseAdmin.storage
        .from("covers")
        .download(ebook.cover_path);

      if (coverFile) {
        const ab = await coverFile.arrayBuffer();
        const buf = Buffer.from(ab);
        const imageType: "png" | "jpg" = isPng(buf) ? "png" : "jpg";

        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                type: imageType,
                data: buf,
                transformation: {
                  width: 380,
                  height: 520,
                },
              }),
            ],
          })
        );

        children.push(
          new Paragraph({
            text: "",
            pageBreakBefore: true,
          })
        );
      }
    }

    // TÍTULO
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: title,
            bold: true,
            size: 40,
          }),
        ],
        spacing: {
          after: 500,
        },
      })
    );

    const lines = content.split("\n");

    for (const raw of lines) {
      const line = raw.trim();

      if (!line) {
        children.push(new Paragraph({ text: "" }));
        continue;
      }

      if (line.startsWith("# ")) {
        children.push(
          new Paragraph({
            text: stripMd(line.replace("# ", "")),
            heading: HeadingLevel.HEADING_1,
            spacing: {
              before: 400,
              after: 250,
            },
          })
        );
        continue;
      }

      if (line.startsWith("## ")) {
        children.push(
          new Paragraph({
            text: stripMd(line.replace("## ", "")),
            heading: HeadingLevel.HEADING_2,
            spacing: {
              before: 300,
              after: 180,
            },
          })
        );
        continue;
      }

      if (line.startsWith("### ")) {
        children.push(
          new Paragraph({
            text: stripMd(line.replace("### ", "")),
            heading: HeadingLevel.HEADING_3,
            spacing: {
              before: 220,
              after: 120,
            },
          })
        );
        continue;
      }

      if (line.startsWith("- ") || line.startsWith("• ")) {
        children.push(
          new Paragraph({
            bullet: {
              level: 0,
            },
            children: [
              new TextRun({
                text: stripMd(line.slice(2)),
                size: 24,
              }),
            ],
            spacing: {
              after: 120,
            },
          })
        );
        continue;
      }

      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: stripMd(line),
              size: 24,
            }),
          ],
          spacing: {
            after: 180,
            line: 320,
          },
        })
      );
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = safeFileName(title);

    return new NextResponse(new Uint8Array (buffer), { 
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition":
          'attachment; filename="' + filename + '.docx"',
      },
    });
  } catch (err: any) {
    console.error("DOCX ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Erro ao gerar DOCX" },
      { status: 500 }
    );
  }
}