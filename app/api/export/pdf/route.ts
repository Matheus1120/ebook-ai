import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
  const s = (input || "ebook").trim() || "ebook";
  return s.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 80);
}

function wrapText(text: string, font: any, size: number, maxWidth: number) {
  const words = String(text || "").replace(/\t/g, " ").trim().split(/\s+/g).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? current + " " + word : word;

    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function isPngBytes(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function drawCoverImage(page: any, img: any) {
  const size = page.getSize();
  const pageW = size.width;
  const pageH = size.height;

  const scale = Math.max(pageW / img.width, pageH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;

  page.drawImage(img, {
    x: (pageW - w) / 2,
    y: (pageH - h) / 2,
    width: w,
    height: h,
  });
}

function stripMarkdown(text: string) {
  return String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .trim();
}

function isChapter(line: string) {
  return /^cap[ií]tulo\s+\d+/i.test(line.trim());
}

export async function POST(req: Request) {
  try {
    const token = getBearer(req);

    if (!token) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const ebookId = body && body.ebookId;

    if (!ebookId) {
      return NextResponse.json({ error: "ebookId é obrigatório." }, { status: 400 });
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

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();

    if (userErr || !userData || !userData.user) {
      return NextResponse.json({ error: "Token inválido." }, { status: 401 });
    }

    const userId = userData.user.id;

    const { data: ebook, error: ebookErr } = await supabaseUser
      .from("ebooks")
      .select("id, title, content, cover_path, user_id")
      .eq("id", ebookId)
      .single();

    if (ebookErr || !ebook) {
      return NextResponse.json({ error: "eBook não encontrado." }, { status: 404 });
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
    const content = String(ebook.content || "Sem conteúdo.").replace(/\r\n/g, "\n");

    const pdf = await PDFDocument.create();

    const fontBody = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const fontSerif = await pdf.embedFont(StandardFonts.TimesRoman);
    const fontSerifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;

    const MARGIN_X = 62;
    const MARGIN_TOP = 86;
    const MARGIN_BOTTOM = 72;
    const TEXT_W = PAGE_W - MARGIN_X * 2;

    function drawFooter(page: any, num: number) {
      const label = String(num);
      const w = fontBody.widthOfTextAtSize(label, 9);

      page.drawLine({
        start: { x: MARGIN_X, y: 48 },
        end: { x: PAGE_W - MARGIN_X, y: 48 },
        thickness: 0.5,
        color: rgb(0.86, 0.86, 0.86),
      });

      page.drawText(label, {
        x: (PAGE_W - w) / 2,
        y: 30,
        size: 9,
        font: fontBody,
        color: rgb(0.45, 0.45, 0.45),
      });
    }

    function drawHeader(page: any) {
      page.drawText(title, {
        x: MARGIN_X,
        y: PAGE_H - 44,
        size: 8.5,
        font: fontBody,
        color: rgb(0.45, 0.45, 0.45),
      });

      page.drawLine({
        start: { x: MARGIN_X, y: PAGE_H - 54 },
        end: { x: PAGE_W - MARGIN_X, y: PAGE_H - 54 },
        thickness: 0.5,
        color: rgb(0.86, 0.86, 0.86),
      });
    }

    // CAPA
    const coverPage = pdf.addPage([PAGE_W, PAGE_H]);

    coverPage.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_W,
      height: PAGE_H,
      color: rgb(0.96, 0.94, 0.9),
    });

    if (ebook.cover_path) {
      const { data: coverFile } = await supabaseAdmin.storage
        .from("covers")
        .download(ebook.cover_path);

      if (coverFile) {
        const ab = await coverFile.arrayBuffer();
        const bytes = new Uint8Array(ab);

        try {
          const img = isPngBytes(bytes)
            ? await pdf.embedPng(bytes)
            : await pdf.embedJpg(bytes);

          drawCoverImage(coverPage, img);
        } catch {
          // ignora capa inválida
        }
      }
    } else {
      const titleLines = wrapText(title, fontSerifBold, 42, PAGE_W - 120);
      let cy = PAGE_H - 230;

      for (const line of titleLines) {
        coverPage.drawText(line, {
          x: 70,
          y: cy,
          size: 42,
          font: fontSerifBold,
          color: rgb(0.08, 0.08, 0.08),
        });
        cy -= 50;
      }
    }

    // PÁGINA DE ABERTURA
    const openPage = pdf.addPage([PAGE_W, PAGE_H]);

    openPage.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_W,
      height: PAGE_H,
      color: rgb(0.985, 0.975, 0.955),
    });

    const openLines = wrapText(title, fontSerifBold, 34, PAGE_W - 140);
    let openY = PAGE_H / 2 + 80;

    for (const line of openLines) {
      const w = fontSerifBold.widthOfTextAtSize(line, 34);
      openPage.drawText(line, {
        x: (PAGE_W - w) / 2,
        y: openY,
        size: 34,
        font: fontSerifBold,
        color: rgb(0.08, 0.08, 0.08),
      });
      openY -= 42;
    }

    const sub = "Edição digital";
    const subW = fontBody.widthOfTextAtSize(sub, 11);
    openPage.drawText(sub, {
      x: (PAGE_W - subW) / 2,
      y: openY - 25,
      size: 11,
      font: fontBody,
      color: rgb(0.45, 0.45, 0.45),
    });

    // SUMÁRIO SIMPLES
    const chapters: string[] = [];
    const rawLines = content.split("\n");

    for (const raw of rawLines) {
      const clean = stripMarkdown(raw.replace(/^#{1,6}\s+/, ""));
      if (isChapter(clean)) chapters.push(clean);
    }

    if (chapters.length > 0) {
      const tocPage = pdf.addPage([PAGE_W, PAGE_H]);

      tocPage.drawText("Sumário", {
        x: MARGIN_X,
        y: PAGE_H - 120,
        size: 28,
        font: fontSerifBold,
        color: rgb(0.08, 0.08, 0.08),
      });

      tocPage.drawLine({
        start: { x: MARGIN_X, y: PAGE_H - 140 },
        end: { x: PAGE_W - MARGIN_X, y: PAGE_H - 140 },
        thickness: 1,
        color: rgb(0.82, 0.82, 0.82),
      });

      let ty = PAGE_H - 180;

      for (const ch of chapters.slice(0, 28)) {
        tocPage.drawText(ch, {
          x: MARGIN_X,
          y: ty,
          size: 12,
          font: fontBody,
          color: rgb(0.12, 0.12, 0.12),
        });
        ty -= 22;
      }
    }

    // CONTEÚDO
    let pageNumber = 1;
    let page = pdf.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN_TOP;

    drawHeader(page);
    drawFooter(page, pageNumber);

    function newPage() {
      pageNumber += 1;
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN_TOP;
      drawHeader(page);
      drawFooter(page, pageNumber);
    }

    function ensureSpace(h: number) {
      if (y - h < MARGIN_BOTTOM) newPage();
    }

    function drawChapter(text: string) {
      if (y < PAGE_H - 180) newPage();

      y = PAGE_H - 210;

      const small = "CAPÍTULO";
      page.drawText(small, {
        x: MARGIN_X,
        y,
        size: 10,
        font: fontBold,
        color: rgb(0.55, 0.45, 0.3),
      });

      y -= 30;

      const lines = wrapText(text, fontSerifBold, 27, TEXT_W);

      for (const l of lines) {
        page.drawText(l, {
          x: MARGIN_X,
          y,
          size: 27,
          font: fontSerifBold,
          color: rgb(0.08, 0.08, 0.08),
        });
        y -= 36;
      }

      page.drawLine({
        start: { x: MARGIN_X, y: y - 4 },
        end: { x: MARGIN_X + 180, y: y - 4 },
        thickness: 1,
        color: rgb(0.82, 0.72, 0.55),
      });

      y -= 36;
    }

    function drawHeading(text: string, level: number) {
      const size = level === 2 ? 17 : 14;
      ensureSpace(50);

      y -= 8;

      const lines = wrapText(text, fontBold, size, TEXT_W);

      for (const l of lines) {
        page.drawText(l, {
          x: MARGIN_X,
          y,
          size,
          font: fontBold,
          color: rgb(0.12, 0.12, 0.12),
        });
        y -= size + 8;
      }

      y -= 6;
    }

    function drawParagraph(text: string) {
      const clean = stripMarkdown(text);
      const lines = wrapText(clean, fontSerif, 12.2, TEXT_W);

      for (const l of lines) {
        ensureSpace(18);

        page.drawText(l, {
          x: MARGIN_X,
          y,
          size: 12.2,
          font: fontSerif,
          color: rgb(0.1, 0.1, 0.1),
        });

        y -= 18;
      }

      y -= 8;
    }

    function drawBullet(text: string) {
      const clean = stripMarkdown(text);
      const lines = wrapText(clean, fontSerif, 12, TEXT_W - 24);

      for (let i = 0; i < lines.length; i++) {
        ensureSpace(18);

        if (i === 0) {
          page.drawText("•", {
            x: MARGIN_X,
            y,
            size: 12,
            font: fontBold,
            color: rgb(0.2, 0.2, 0.2),
          });
        }

        page.drawText(lines[i], {
          x: MARGIN_X + 22,
          y,
          size: 12,
          font: fontSerif,
          color: rgb(0.1, 0.1, 0.1),
        });

        y -= 18;
      }

      y -= 5;
    }

    for (const raw of rawLines) {
      const line = raw.trim();

      if (!line) {
        y -= 8;
        continue;
      }

      const clean = stripMarkdown(line.replace(/^#{1,6}\s+/, ""));

      if (isChapter(clean)) {
        drawChapter(clean);
        continue;
      }

      if (line.startsWith("# ")) {
        drawHeading(line.replace("# ", ""), 2);
        continue;
      }

      if (line.startsWith("## ")) {
        drawHeading(line.replace("## ", ""), 2);
        continue;
      }

      if (line.startsWith("### ")) {
        drawHeading(line.replace("### ", ""), 3);
        continue;
      }

      if (line.startsWith("- ") || line.startsWith("• ")) {
        drawBullet(line.slice(2));
        continue;
      }

      drawParagraph(line);
    }

    const pdfBytes = await pdf.save();
    const filename = safeFileName(title);

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="' + filename + '.pdf"',
      },
    });
  } catch (err: any) {
    console.error("PDF ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Erro ao gerar PDF" },
      { status: 500 }
    );
  }
}