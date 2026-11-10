import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AppShell, type EnvBadge } from "@/components/app-shell";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { supabaseConfigured } from "@/lib/supabase/server";
import { signOut } from "./login/actions";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = { title: "Radar", description: "Oportunidades, fornecedores, estoque e lucro no Mercado Livre" };
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f17" },
  ],
};

/** Em qual banco o app está: evita confundir desenvolvimento com produção. */
function envBadge(): EnvBadge | null {
  if (process.env.VERCEL) return null;
  if (process.env.RADAR_DEV_ON_PROD === "1") return { label: "ATENÇÃO: .env.local aponta para o banco de PRODUÇÃO", tone: "danger" };
  if (process.env.RADAR_ENV === "dev") return { label: "Ambiente DEV", tone: "info" };
  return { label: "LOCAL • banco de produção", tone: "danger" };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // o <html> fica sem className controlado pelo React: a classe .dark é do script/botão de tema
    // (se o React controlasse o className, um re-render apagaria o tema escolhido)
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${inter.variable} min-h-screen font-sans antialiased`}>
        <AppShell env={envBadge()} signOut={signOut} showSignOut={supabaseConfigured()}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
