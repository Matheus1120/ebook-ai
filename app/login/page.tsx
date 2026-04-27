"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Se já estiver logado, manda pro dashboard
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace("/dashboard");
    })();
  }, [router]);

  async function entrar() {
    setLoading(true);
    setMsg(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    setLoading(false);

    if (error) {
      setMsg("ERRO login: " + error.message);
      return;
    }

    router.replace("/dashboard");
  }

  async function cadastrar() {
    setLoading(true);
    setMsg(null);

    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        // importante para confirmação por email
        emailRedirectTo: "http://localhost:3000/login",
      },
    });

    setLoading(false);

    if (error) {
      setMsg("ERRO cadastro: " + error.message);
      return;
    }

    setMsg("Cadastro feito! Verifique seu email para confirmar.");
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={{ marginTop: 0 }}>Entrar</h2>

        <input
          style={styles.input}
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          style={styles.input}
          placeholder="Senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />

        <div style={styles.row}>
          <button style={styles.btnPrimary} onClick={entrar} disabled={loading}>
            {loading ? "..." : "Entrar"}
          </button>

          <button style={styles.btnGhost} onClick={cadastrar} disabled={loading}>
            {loading ? "..." : "Cadastrar"}
          </button>
        </div>

        {msg && <p style={styles.msg}>{msg}</p>}
      </div>
    </div>
  );
}

const styles: Record<string, any> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#000",
    padding: 24,
  },
  card: {
    width: "min(520px, 92vw)",
    border: "1px solid #222",
    background: "#0b0b0b",
    borderRadius: 12,
    padding: 22,
    color: "#fff",
  },
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "1px solid #222",
    background: "#111",
    color: "#fff",
    marginTop: 10,
    outline: "none",
  },
  row: {
    display: "flex",
    gap: 10,
    marginTop: 14,
  },
  btnPrimary: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    border: "1px solid #333",
    background: "#fff",
    color: "#000",
    cursor: "pointer",
    fontWeight: 700,
  },
  btnGhost: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    border: "1px solid #333",
    background: "#0b0b0b",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  },
  msg: { marginTop: 12, opacity: 0.9 },
};
