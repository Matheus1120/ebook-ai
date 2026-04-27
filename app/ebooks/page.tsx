"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Ebook = { id: string; titulo: string; status: "Rascunho" | "Gerado" | "Publicado" };

export default function EbooksPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);

  // lista fake (depois a gente troca para Supabase Database)
  const [ebooks, setEbooks] = useState<Ebook[]>([
    { id: "1", titulo: "Guia de Relacionamentos (exemplo)", status: "Rascunho" },
    { id: "2", titulo: "Como vender mais (exemplo)", status: "Gerado" },
  ]);

  useEffect(() => {
    async function guard() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setEmail(data.session.user.email ?? "");
      setLoading(false);
    }
    guard();
  }, [router]);

  async function sair() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function remover(id: string) {
    setEbooks((prev) => prev.filter((e) => e.id !== id));
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.box}>
          <h1 style={styles.title}>Meus eBooks</h1>
          <p style={styles.sub}>Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Meus eBooks</h1>
            <p style={styles.sub}>
              Logado como: <b>{email}</b>
            </p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button style={styles.btn} onClick={() => router.push("/dashboard")}>
              Voltar
            </button>
            <button style={styles.btnDanger} onClick={sair}>
              Sair
            </button>
          </div>
        </div>

        <div style={styles.toolbar}>
          <button style={styles.btnPrimary} onClick={() => router.push("/create")}>
            + Criar novo eBook
          </button>
        </div>

        <div style={styles.grid}>
          {ebooks.map((e) => (
            <div key={e.id} style={styles.card}>
              <h2 style={styles.cardTitle}>{e.titulo}</h2>
              <p style={styles.badge}>Status: {e.status}</p>

              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button style={styles.btn}>Abrir</button>
                <button style={styles.btn}>Baixar</button>
                <button style={styles.btnDanger} onClick={() => remover(e.id)}>
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>

        {ebooks.length === 0 && (
          <div style={styles.empty}>
            <p style={{ margin: 0 }}>Você ainda não tem eBooks.</p>
            <button style={{ ...styles.btnPrimary, marginTop: 10 }} onClick={() => router.push("/create")}>
              Criar o primeiro
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#000",
    display: "flex",
    justifyContent: "center",
    padding: 24,
    color: "#fff",
  },
  container: { width: "100%", maxWidth: 980 },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 16,
    padding: 16,
    border: "1px solid #222",
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
  },
  title: { margin: 0, fontSize: 32, lineHeight: "36px" },
  sub: { margin: "8px 0 0", color: "#cfcfcf" },
  toolbar: {
    display: "flex",
    justifyContent: "flex-start",
    marginTop: 10,
    marginBottom: 12,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
    marginTop: 12,
  },
  card: {
    border: "1px solid #222",
    borderRadius: 14,
    padding: 18,
    background: "rgba(255,255,255,0.03)",
  },
  cardTitle: { margin: 0, fontSize: 18 },
  badge: {
    margin: "10px 0 0",
    padding: "6px 10px",
    border: "1px solid #333",
    borderRadius: 999,
    display: "inline-block",
    color: "#cfcfcf",
    background: "rgba(255,255,255,0.03)",
    fontSize: 12,
  },
  btn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #333",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
  },
  btnPrimary: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #333",
    background: "#141414",
    color: "#fff",
    cursor: "pointer",
  },
  btnDanger: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #444",
    background: "#1b0b0b",
    color: "#fff",
    cursor: "pointer",
  },
  empty: {
    marginTop: 12,
    padding: 16,
    border: "1px solid #222",
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
    color: "#cfcfcf",
  },
  box: {
    border: "1px solid #222",
    borderRadius: 12,
    padding: 18,
    background: "rgba(255,255,255,0.03)",
  },
};
