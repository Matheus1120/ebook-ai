import { Suspense } from "react";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<main style={{ padding: 40 }}>Carregando painel...</main>}>
      <DashboardClient />
    </Suspense>
  );
}