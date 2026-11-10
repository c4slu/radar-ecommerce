import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Radar", description: "Fornecedores, estoque e risco de mercado" };

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/oportunidades", label: "Oportunidades" },
  { href: "/calculadora", label: "Calculadora" },
  { href: "/produtos", label: "Produtos" },
  { href: "/fornecedores", label: "Fornecedores" },
  { href: "/estoque", label: "Estoque" },
  { href: "/pesquisa", label: "Pesquisa de mercado" },
  { href: "/configuracoes", label: "Configurações" },
];

/** Em qual banco o app está: evita confundir desenvolvimento com produção. */
function envBadge() {
  if (process.env.VERCEL) return null;
  if (process.env.RADAR_DEV_ON_PROD === "1")
    return { label: "ATENÇÃO: .env.local aponta para o banco de PRODUÇÃO", cls: "bg-red-600 text-white" };
  if (process.env.RADAR_ENV === "dev") return { label: "DEV", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300" };
  return { label: "LOCAL • banco de produção", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const env = envBadge();
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        <div className="flex">
          <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r border-zinc-200 p-4 md:block dark:border-zinc-800">
            <div className="mb-6">
              <div className="text-lg font-semibold">Radar</div>
              {env && <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${env.cls}`}>{env.label}</span>}
            </div>
            <nav className="space-y-1 text-sm">
              {NAV.map((n) => (
                <Link key={n.label} href={n.href} className="block rounded px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  {n.label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
