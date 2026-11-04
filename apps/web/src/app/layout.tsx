import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Radar", description: "Fornecedores, estoque e risco de mercado" };

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/produtos", label: "Produtos" },
  { href: "/fornecedores", label: "Fornecedores" },
  { href: "/estoque", label: "Estoque" },
  { href: "/calculadora", label: "Calculadora de risco" },
  { href: "#", label: "Pesquisa de mercado", soon: true },
  { href: "/configuracoes", label: "Configurações" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        <div className="flex">
          <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r border-zinc-200 p-4 md:block dark:border-zinc-800">
            <div className="mb-6 text-lg font-semibold">Radar</div>
            <nav className="space-y-1 text-sm">
              {NAV.map((n) =>
                n.soon ? (
                  <span key={n.label} className="block px-2 py-1.5 text-zinc-400">
                    {n.label} <span className="text-[10px]">em breve</span>
                  </span>
                ) : (
                  <Link key={n.label} href={n.href} className="block rounded px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    {n.label}
                  </Link>
                ),
              )}
            </nav>
          </aside>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
