"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [createdAt, setCreatedAt] = useState<string>("");

  useEffect(() => {
    async function guard() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }

      const user = data.session.user;
      setEmail(user.email ?? "");
      setUserId(user.id);
      setCreatedAt(user.created_at ?? "");
      setLoading(false);
    }
    guard();
  }, [router]);

  async function sair() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.box}>
          <h1 style={styles.title}>Conta</h1>
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
            <h1 style={styles.title}>Conta</h1>
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

        <div style={styles.grid2}>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Informações</h2>

            <div style={styles.row}>
              <span style={styles.key}>Email</span>
              <span style={styles.value}>{email}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.key}>User ID</span>
              <span style={styles.value}>{userId}</span>
            </div>
            <div style={styles.row}>
              <span style={styles.key}>Criado em</span>
              <span style={styles.value}>{createdAt || "-"}</span>
            </div>
          </div>

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Ações</h2>
            <p style={styles.sub}>
              Depois a gente coloca: trocar senha, atualizar perfil, preferências, etc.
            </p>

            <button style={styles.btnPrimary} onClick={() => alert("Em breve: trocar senha")}>
              Trocar senha
            </button>

            <button style={{ ...styles.btnPrimary, marginTop: 10 }} onClick={() => alert("Em breve: preferências")}>
              Preferências
            </button>
          </div>
        </div>
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
  grid2: {
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
  cardTitle: { margin: 0, fontSize: 18, marginBottom: 12 },
  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid #1a1a1a",
  },
  key: { color: "#cfcfcf" },
  value: { color: "#fff", maxWidth: 520, overflow: "hidden", textOverflow: "ellipsis" },
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
    width: "100%",
  },
  btnDanger: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #444",
    background: "#1b0b0b",
    color: "#fff",
    cursor: "pointer",
  },
  box: {
    border: "1px solid #222",
    borderRadius: 12,
    padding: 18,
    background: "rgba(255,255,255,0.03)",
  },
};
