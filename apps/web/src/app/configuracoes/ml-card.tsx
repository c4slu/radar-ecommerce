import { getConnection } from "@radar/ml";
import { DeleteButton } from "@/components/action-form";
import { Badge } from "@/components/ui";
import { disconnectMl } from "./actions";

const MESSAGES: Record<string, string> = {
  ok: "Conta do Mercado Livre conectada.",
  https: "O Mercado Livre só aceita retorno em https: conecte pela URL da Vercel (ou defina ML_REDIRECT_URI).",
};

export async function MlCard({ status, detail }: { status?: string; detail?: string }) {
  let conn: Awaited<ReturnType<typeof getConnection>> = { connected: false };
  let error: string | null = null;
  try {
    conn = await getConnection();
  } catch (err) {
    error = (err as Error).message;
  }
  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">Mercado Livre</h2>
        {conn.connected ? <Badge tone="green">conectado</Badge> : <Badge tone="amber">não conectado</Badge>}
      </div>
      {status && (
        <p className={`mb-3 text-sm ${status === "ok" ? "text-emerald-600" : "text-red-600"}`}>
          {MESSAGES[status] ?? "Falha ao conectar."} {status === "ok" && detail ? `(${detail})` : status === "erro" ? detail : ""}
        </p>
      )}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {conn.connected ? (
        <div className="flex items-center justify-between text-sm">
          <span>
            Conta <strong>{conn.nickname ?? conn.userId ?? "?"}</strong>
            {conn.expiresAt && (
              <span className="text-zinc-500"> · token renova sozinho (atual vence {conn.expiresAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })})</span>
            )}
          </span>
          <DeleteButton action={disconnectMl} label="Desconectar" confirmText="Desconectar a conta do Mercado Livre? Os coletores param até reconectar." />
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-zinc-500">
            Necessário para buscar concorrentes, preços e tendências. A conexão só lê dados públicos de mercado.
          </p>
          <a href="/api/ml/connect" className="btn inline-block">
            Conectar Mercado Livre
          </a>
        </div>
      )}
    </div>
  );
}
