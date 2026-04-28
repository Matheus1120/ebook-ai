
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Ebook = {
  id: string;
  title: string | null;
  content: string | null;
  created_at?: string | null;
  user_id?: string | null;
  cover_path?: string | null; // se já estiver no banco
};

type Mode = "capitulos" | "sem";

function mdPreview(md: string, maxChars = 1200) {
  const s = (md || "").trim();
  if (!s) return "Sem conteúdo.";
  const cleaned = s
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1");
  return cleaned.slice(0, maxChars) + (cleaned.length > maxChars ? "…" : "");
}

// ✅ estilos de capa suportados
const COVER_STYLES = [
  { value: "minimalista", label: "Minimalista" },
  { value: "3d", label: "3D" },
  { value: "cartoon", label: "Cartoon" },
  { value: "anime", label: "Anime" },
  { value: "fotorealista", label: "Fotorealista" },
  { value: "neon", label: "Neon" },
  { value: "vintage", label: "Vintage" },
  { value: "corporativo", label: "Corporativo" },
  { value: "clean", label: "Clean (tipo Kindle)" },
];

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Form (criar/editar)
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [mode, setMode] = useState<Mode>("capitulos");
  const [chapters, setChapters] = useState(8);

  // Toggles dos botões "Usar X"
  const [useTopic, setUseTopic] = useState(true);
  const [useAudience, setUseAudience] = useState(true);
  const [useTone, setUseTone] = useState(true);

  // ✅ CAPA
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
  const [coverStyle, setCoverStyle] = useState<string>("clean");
  const [coverHint, setCoverHint] = useState<string>(""); // opcional (subtítulo / frase / referência)
  const fileRef = useRef<HTMLInputElement | null>(null);

  const chaptersFinal = useMemo(() => {
    if (mode === "sem") return 0;
    const n = Number(chapters || 0);
    return Math.max(3, Math.min(20, isNaN(n) ? 8 : n));
  }, [mode, chapters]);

  // Lista e seleção
  const [ebooks, setEbooks] = useState<Ebook[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => ebooks.find((e) => e.id === selectedId) || null,
    [ebooks, selectedId]
  );

  useEffect(() => {
    async function boot() {
      setErrorMsg("");
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setEmail(data.session.user.email ?? "");
      setSessionToken(data.session.access_token);

      await loadEbooks(true);

      const qp = searchParams?.get("select");
      if (qp) setSelectedId(qp);

      setLoading(false);
    }
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function sair() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function loadEbooks(keepSelection = false) {
    setErrorMsg("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) {
        setErrorMsg("Não autenticado.");
        return;
      }

      const { data, error } = await supabase
        .from("ebooks")
        .select("id, title, content, created_at, user_id, cover_path")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        setErrorMsg("Erro ao carregar eBooks: " + error.message);
        return;
      }

      const list = (data || []) as Ebook[];
      setEbooks(list);

      if (!keepSelection) {
        setSelectedId(list?.[0]?.id ?? null);
      } else {
        setSelectedId((prev) => {
          if (prev && list.some((x) => x.id === prev)) return prev;
          return list?.[0]?.id ?? null;
        });
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "Erro inesperado ao carregar eBooks.");
    }
  }

  async function criarEbook() {
    setErrorMsg("");
    if (!title.trim()) {
      setErrorMsg("Título é obrigatório.");
      return;
    }
    if (!sessionToken) {
      setErrorMsg("Não autenticado.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/ebooks/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ title: title.trim() }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(json?.error || "Erro ao criar eBook.");
        return;
      }

      await loadEbooks(true);
      setSelectedId(json.ebook.id);
      setTitle("");
    } catch (e: any) {
      setErrorMsg(e?.message || "Erro inesperado ao criar eBook.");
    } finally {
      setBusy(false);
    }
  }

  async function atualizarTitulo() {
    setErrorMsg("");
    if (!selected) {
      setErrorMsg("Selecione um eBook.");
      return;
    }
    if (!title.trim()) {
      setErrorMsg("Título é obrigatório.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase
        .from("ebooks")
        .update({ title: title.trim() })
        .eq("id", selected.id);

      if (error) {
        setErrorMsg("Erro ao atualizar: " + error.message);
        return;
      }

      await loadEbooks(true);
    } catch (e: any) {
      setErrorMsg(e?.message || "Erro inesperado ao atualizar.");
    } finally {
      setBusy(false);
    }
  }

  async function gerarComIA() {
    setErrorMsg("");
    if (!selected) {
      setErrorMsg("Selecione um eBook.");
      return;
    }
    if (!sessionToken) {
      setErrorMsg("Não autenticado.");
      return;
    }

    const payload = {
      ebookId: selected.id,
      title: selected.title || "eBook",
      topic: useTopic ? topic : "",
      audience: useAudience ? audience : "",
      tone: useTone ? tone : "",
      mode,
      chapters: chaptersFinal,
    };

    setBusy(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(json?.error || "Erro ao gerar com IA.");
        return;
      }

      await loadEbooks(true);
    } catch (e: any) {
      setErrorMsg(e?.message || "Erro inesperado ao gerar com IA.");
    } finally {
      setBusy(false);
    }
  }

  // ==========================
  // ✅ CAPA: Upload manual
  // ==========================
  async function onPickCoverFile(file: File | null) {
    setErrorMsg("");
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setCoverDataUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function enviarCapa() {
    setErrorMsg("");
    if (!selected) return setErrorMsg("Selecione um eBook.");
    if (!sessionToken) return setErrorMsg("Não autenticado.");
    if (!coverDataUrl) return setErrorMsg("Selecione/gera uma imagem primeiro.");

    setBusy(true);
    try {
      const res = await fetch("/api/cover/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          ebookId: selected.id,
          dataUrl: coverDataUrl,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(json?.error || "Erro ao enviar capa.");
        return;
      }

      await loadEbooks(true);
    } catch (e: any) {
      setErrorMsg(e?.message || "Erro inesperado ao enviar capa.");
    } finally {
      setBusy(false);
    }
  }

  // ==========================
  // ✅ CAPA: Gerar com IA + “Gerar outra”
  // ==========================
  async function gerarCapaComIA(isRegenerate = false) {
    setErrorMsg("");
    if (!selected) return setErrorMsg("Selecione um eBook.");
    if (!selected.title?.trim()) return setErrorMsg("O eBook precisa ter um título.");
    if (!sessionToken) return setErrorMsg("Não autenticado.");

    setBusy(true);
    try {
      const res = await fetch("/api/cover/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          ebookId: selected.id,
          title: selected.title,
          topic: useTopic ? topic : "",
          style: coverStyle,
          hint: coverHint,
          regenerate: isRegenerate, // ✅ “Gerar outra”
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(json?.error || "Erro ao gerar capa com IA.");
        return;
      }

      if (!json?.dataUrl) {
        setErrorMsg("A API não retornou a imagem (dataUrl).");
        return;
      }

      setCoverDataUrl(json.dataUrl);
    } catch (e: any) {
      setErrorMsg(e?.message || "Erro inesperado ao gerar capa com IA.");
    } finally {
      setBusy(false);
    }
  }

  async function baixarArquivo(kind: "pdf" | "docx") {
    setErrorMsg("");
    if (!selected) return setErrorMsg("Selecione um eBook.");
    if (!sessionToken) return setErrorMsg("Não autenticado.");
    if (!selected.content) return setErrorMsg("Esse eBook ainda está sem conteúdo.");

    setBusy(true);
    try {
      const endpoint = kind === "pdf" ? "/api/export/pdf" : "/api/export/docx";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ ebookId: selected.id }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        setErrorMsg(txt || `Erro ao exportar ${kind.toUpperCase()}.`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = (selected.title || "ebook").replace(/[^\w\-]+/g, "_").slice(0, 80);
      a.download = `${safe}.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setErrorMsg(e?.message || `Erro inesperado ao baixar ${kind.toUpperCase()}.`);
    } finally {
      setBusy(false);
    }
  }

  function selectEbook(e: Ebook) {
    setSelectedId(e.id);
    setTitle(e.title || "");
    setCoverDataUrl(null);
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>Carregando...</div>
      </div>
    );
  }

  const selectedHasCover = Boolean(selected?.cover_path);

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.topbar}>
          <div>
            <div style={styles.h1}>Painel</div>
            <div style={styles.sub}>
              Logado como: <b>{email}</b>
            </div>
            {errorMsg ? <div style={styles.err}>Erro: {errorMsg}</div> : null}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={styles.btn} onClick={() => router.push("/create")}>
              Criar (Página)
            </button>
            <button style={styles.btnDanger} onClick={sair}>
              Sair
            </button>
          </div>
        </div>

        <div style={styles.grid3}>
          {/* Coluna 1 */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>Criar eBook</div>

            <label style={styles.label}>Título *</label>
            <input
              style={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Como vender mais com relacionamento"
            />

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button style={styles.btnGold} onClick={criarEbook} disabled={busy}>
                {busy ? "..." : "Salvar"}
              </button>
              <button style={styles.btn} onClick={atualizarTitulo} disabled={busy || !selected}>
                Atualizar
              </button>
            </div>

            <div style={styles.divider} />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={chip(useTopic)} onClick={() => setUseTopic((v) => !v)} type="button">
                {useTopic ? "✅ Usar Tema" : "⛔ Não usar Tema"}
              </button>
              <button
                style={chip(useAudience)}
                onClick={() => setUseAudience((v) => !v)}
                type="button"
              >
                {useAudience ? "✅ Usar Público" : "⛔ Não usar Público"}
              </button>
              <button style={chip(useTone)} onClick={() => setUseTone((v) => !v)} type="button">
                {useTone ? "✅ Usar Tom" : "⛔ Não usar Tom"}
              </button>
            </div>

            <label style={styles.label}>Tema</label>
            <input
              style={styles.input}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ex: Relacionamentos, vendas, autoestima..."
              disabled={!useTopic}
            />

            <label style={styles.label}>Público-alvo</label>
            <input
              style={styles.input}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="Ex: Iniciantes, casais, homens, mulheres..."
              disabled={!useAudience}
            />

            <label style={styles.label}>Tom de voz</label>
            <input
              style={styles.input}
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="Ex: Motivacional, direto, didático..."
              disabled={!useTone}
            />

            <label style={styles.label}>Formato</label>
            <select style={styles.input} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="capitulos">Com capítulos</option>
              <option value="sem">Sem capítulos</option>
            </select>

            {mode === "capitulos" ? (
              <>
                <label style={styles.label}>Quantidade de capítulos</label>
                <input
                  style={styles.input}
                  type="number"
                  min={3}
                  max={20}
                  value={chapters}
                  onChange={(e) => setChapters(Number(e.target.value))}
                />
              </>
            ) : null}
          </div>

          {/* Coluna 2 */}
          <div style={styles.card}>
            <div style={styles.rowBetween}>
              <div style={styles.cardTitle}>Meus eBooks</div>
              <button style={styles.btn} onClick={() => loadEbooks(true)} disabled={busy}>
                Atualizar
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {ebooks.length === 0 ? (
                <div style={styles.muted}>Nenhum eBook ainda.</div>
              ) : (
                ebooks.map((e) => {
                  const active = e.id === selectedId;
                  const hasContent = Boolean((e.content || "").trim());
                  const hasCover = Boolean(e.cover_path);
                  return (
                    <button
                      key={e.id}
                      onClick={() => selectEbook(e)}
                      style={{ ...styles.item, ...(active ? styles.itemActive : {}) }}
                    >
                      <div style={styles.itemTitle}>{e.title || "(sem título)"}</div>
                      <div style={styles.itemMeta}>
                        {hasContent ? (
                          <span style={{ color: "#22c55e", fontWeight: 800 }}>✓ Com conteúdo</span>
                        ) : (
                          <span style={{ color: "#fbbf24", fontWeight: 800 }}>● Sem conteúdo</span>
                        )}
                        {"  "}
                        {hasCover ? (
                          <span style={{ color: "#22c55e", fontWeight: 800 }}>✓ Com capa</span>
                        ) : (
                          <span style={{ color: "#fbbf24", fontWeight: 800 }}>● Sem capa</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Coluna 3 */}
          <div style={styles.card}>
            <div style={styles.rowBetween}>
              <div>
                <div style={styles.cardTitle}>Visualizar</div>
                <div style={styles.mutedSmall}>{selected?.title || "Selecione um eBook"}</div>
                <div style={styles.mutedSmall}>
                  Status capa:{" "}
                  <b style={{ color: selectedHasCover ? "#22c55e" : "#fbbf24" }}>
                    {selectedHasCover ? "Com capa" : "Sem capa"}
                  </b>
                </div>
              </div>

              <button style={styles.btnGold} onClick={gerarComIA} disabled={busy || !selected}>
                {busy ? "..." : "Gerar com IA"}
              </button>
            </div>

            {/* ✅ BLOCO CAPA */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Capa</div>

              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={styles.mutedSmall}>Estilo</div>
                    <select
                      style={styles.input}
                      value={coverStyle}
                      onChange={(e) => setCoverStyle(e.target.value)}
                      disabled={busy || !selected}
                    >
                      {COVER_STYLES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div style={styles.mutedSmall}>Extra (opcional)</div>
                    <input
                      style={styles.input}
                      value={coverHint}
                      onChange={(e) => setCoverHint(e.target.value)}
                      placeholder='Ex: "Guia prático" / "Edição 2026" / "Para iniciantes"'
                      disabled={busy || !selected}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    style={styles.btn}
                    onClick={() => fileRef.current?.click()}
                    disabled={busy || !selected}
                    title="Selecionar imagem do computador"
                  >
                    Selecionar imagem
                  </button>

                  <button
                    style={styles.btnGold}
                    onClick={() => gerarCapaComIA(false)}
                    disabled={busy || !selected}
                    title="Gera uma capa nova"
                  >
                    {busy ? "..." : "Gerar capa com IA"}
                  </button>

                  <button
                    style={styles.btn}
                    onClick={() => gerarCapaComIA(true)}
                    disabled={busy || !selected}
                    title="Gera uma variação diferente"
                  >
                    {busy ? "..." : "Gerar outra (variação)"}
                  </button>
                </div>
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                onChange={(e) => onPickCoverFile(e.target.files?.[0] || null)}
              />

              {coverDataUrl ? (
                <div style={styles.coverBox}>
                  <img
                    src={coverDataUrl}
                    alt="Capa"
                    style={{ width: "100%", borderRadius: 12, display: "block" }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                    <button style={styles.btnGold} onClick={enviarCapa} disabled={busy}>
                      {busy ? "..." : "Salvar capa"}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={styles.mutedSmall}>Nenhuma capa selecionada/gerada ainda.</div>
              )}
            </div>

            <div style={styles.viewer}>
              {selected?.content ? <pre style={styles.pre}>{selected.content}</pre> : <div style={styles.muted}>Sem conteúdo.</div>}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
              <button style={styles.btn} onClick={() => baixarArquivo("pdf")} disabled={busy || !selected?.content}>
                Baixar PDF
              </button>
              <button style={styles.btn} onClick={() => baixarArquivo("docx")} disabled={busy || !selected?.content}>
                Baixar DOCX
              </button>
            </div>

            <div style={{ marginTop: 12, color: "#9aa", fontSize: 12 }}>
              Preview: {selected?.content ? mdPreview(selected.content) : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function chip(active: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 999,
    border: "1px solid #333",
    background: active ? "rgba(34,197,94,0.18)" : "#111",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
  };
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#000", color: "#fff", padding: 24 },
  shell: { maxWidth: 1200, margin: "0 auto" },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    padding: 16,
    borderRadius: 14,
    border: "1px solid #222",
    background: "rgba(255,255,255,0.03)",
    marginBottom: 14,
  },
  h1: { fontSize: 34, fontWeight: 900 },
  sub: { marginTop: 6, color: "#cfcfcf" },
  err: { marginTop: 10, color: "rgb(255, 191, 36)", fontWeight: 900 },

  grid3: { display: "grid", gridTemplateColumns: "1.05fr 1fr 1.2fr", gap: 14, alignItems: "start" },
  card: { border: "1px solid #222", borderRadius: 14, padding: 16, background: "rgba(255,255,255,0.03)", minHeight: 520 },
  cardTitle: { fontSize: 18, fontWeight: 900, marginBottom: 10 },
  rowBetween: { display: "flex", justifyContent: "space-between", alignItems: "center" },

  label: { display: "block", marginTop: 12, color: "#cfcfcf" },
  input: { width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 12, border: "1px solid #333", background: "#0d0d0d", color: "#fff", outline: "none" },

  btn: { padding: "10px 12px", borderRadius: 12, border: "1px solid #333", background: "#111", color: "#fff", cursor: "pointer", fontWeight: 800 },
  btnGold: { padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,191,36,0.55)", background: "rgba(255,191,36,0.12)", color: "#fff", cursor: "pointer", fontWeight: 900 },
  btnDanger: { padding: "10px 12px", borderRadius: 12, border: "1px solid #444", background: "#1b0b0b", color: "#fff", cursor: "pointer", fontWeight: 900 },

  divider: { height: 1, background: "#222", margin: "14px 0" },

  item: { width: "100%", textAlign: "left", borderRadius: 14, border: "1px solid #222", background: "rgba(0,0,0,0.25)", padding: 14, cursor: "pointer" },
  itemActive: { border: "1px solid rgba(255,191,36,0.55)", background: "rgba(255,191,36,0.10)" },
  itemTitle: { fontSize: 16, fontWeight: 900 },
  itemMeta: { marginTop: 6, fontSize: 12, color: "#cfcfcf" },

  coverBox: { marginTop: 10, border: "1px solid #222", borderRadius: 14, padding: 12, background: "rgba(0,0,0,0.25)" },

  viewer: { marginTop: 12, border: "1px solid #222", borderRadius: 14, padding: 14, background: "rgba(0,0,0,0.25)", height: 300, overflow: "auto" },
  pre: { margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12.5, lineHeight: 1.6 },
  muted: { color: "#9aa", padding: 8 },
  mutedSmall: { color: "#9aa", fontSize: 12, marginTop: 6 },
};
