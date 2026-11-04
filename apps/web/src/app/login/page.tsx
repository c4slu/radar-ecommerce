import { sendMagicLink } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams;
  return (
    <main className="mx-auto mt-24 max-w-sm">
      <div className="card">
        <h1 className="mb-1 text-lg font-semibold">Radar</h1>
        <p className="mb-4 text-sm text-zinc-500">Entre com o link mágico enviado ao seu e-mail.</p>
        {sent ? (
          <p className="text-sm text-emerald-600">Link enviado. Confira sua caixa de entrada.</p>
        ) : (
          <form action={sendMagicLink} className="space-y-3">
            <input name="email" type="email" required placeholder="seu@email.com" className="input" />
            <button className="btn w-full">Enviar link</button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
