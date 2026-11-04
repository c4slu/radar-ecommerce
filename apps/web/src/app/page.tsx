import { count, desc } from "drizzle-orm";
import { getDb, jobRuns, products, suppliers } from "@radar/db";
import { signOut } from "./login/actions";
import { supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function loadStats() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const db = getDb();
    const [[p], [s], runs] = await Promise.all([
      db.select({ n: count() }).from(products),
      db.select({ n: count() }).from(suppliers),
      db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(8),
    ]);
    return { products: p?.n ?? 0, suppliers: s?.n ?? 0, runs };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function Dashboard() {
  const stats = await loadStats();
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {supabaseConfigured() && (
          <form action={signOut}>
            <button className="text-sm text-zinc-500 hover:underline">Sair</button>
          </form>
        )}
      </header>

      {!stats ? (
        <div className="card border-amber-300 text-sm">
          <p className="font-medium">Banco ainda não configurado.</p>
          <p className="mt-1 text-zinc-500">
            Copie <code>.env.example</code> para <code>.env</code> na raiz, preencha <code>DATABASE_URL</code> e rode{" "}
            <code>npm run db:migrate</code>. Enquanto isso, a <a className="underline" href="/calculadora">calculadora de risco</a>{" "}
            já funciona sem banco.
          </p>
        </div>
      ) : "error" in stats ? (
        <div className="card text-sm text-red-600">Erro ao conectar no banco: {stats.error}</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Produtos" value={stats.products} />
            <Stat label="Fornecedores" value={stats.suppliers} />
            <Stat label="Execuções recentes de jobs" value={stats.runs.length} />
          </div>
          <div className="card">
            <h2 className="mb-3 font-medium">Últimos jobs</h2>
            {stats.runs.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhum job executado ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {stats.runs.map((r) => (
                    <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="py-1.5">{r.job}</td>
                      <td className={r.status === "error" ? "text-red-600" : r.status === "success" ? "text-emerald-600" : ""}>
                        {r.status}
                      </td>
                      <td className="text-zinc-500">{r.startedAt.toLocaleString("pt-BR")}</td>
                      <td className="text-right">{r.itemsProcessed ?? "-"} itens</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
