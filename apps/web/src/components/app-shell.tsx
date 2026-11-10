"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Boxes,
  Calculator,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Radar,
  Search,
  Settings,
  Sparkles,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/oportunidades", label: "Oportunidades", icon: Sparkles },
      { href: "/calculadora", label: "Calculadora", icon: Calculator },
    ],
  },
  {
    title: "Operação",
    items: [
      { href: "/produtos", label: "Produtos", icon: Package },
      { href: "/fornecedores", label: "Fornecedores", icon: Truck },
      { href: "/estoque", label: "Estoque", icon: Boxes },
      { href: "/pesquisa", label: "Pesquisa de mercado", icon: Search },
    ],
  },
  { title: "Sistema", items: [{ href: "/configuracoes", label: "Configurações", icon: Settings }] },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

export interface EnvBadge {
  label: string;
  tone: "info" | "danger";
}

export function AppShell({
  children,
  env,
  signOut,
  showSignOut,
}: {
  children: React.ReactNode;
  env: EnvBadge | null;
  signOut: () => Promise<void>;
  showSignOut: boolean;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // fecha o menu do celular ao navegar
  useEffect(() => setOpen(false), [path]);
  // tela de login sem a moldura do app
  if (path.startsWith("/login")) return <>{children}</>;

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-2.5 px-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-700 text-white dark:bg-brand-500 dark:text-zinc-950">
          <Radar className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-base font-semibold leading-tight">Radar</div>
          <div className="muted text-xs">e-commerce</div>
        </div>
      </div>
      {env && (
        <div
          role="status"
          className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
            env.tone === "danger" ? "bg-red-600 text-white" : "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200"
          }`}
        >
          {env.label}
        </div>
      )}
      <nav aria-label="Principal" className="flex-1 space-y-5 overflow-y-auto">
        {NAV.map((group, gi) => (
          <div key={gi} className="space-y-1">
            {group.title && <div className="muted px-3 pb-1 text-xs font-medium uppercase tracking-wider">{group.title}</div>}
            {group.items.map((item) => {
              const active = isActive(path, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150 ${
                    active
                      ? "bg-brand-50 font-semibold text-brand-800 dark:bg-brand-500/15 dark:text-brand-400"
                      : "muted hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="space-y-1 border-t pt-3 divider">
        <ThemeToggle />
        {showSignOut && (
          <form action={signOut}>
            <button className="btn-ghost w-full justify-start">
              <LogOut className="h-4 w-4" aria-hidden />
              Sair
            </button>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* desktop */}
      <aside className="sticky top-0 hidden h-screen border-r lg:block divider" style={{ background: "var(--surface)" }}>
        {sidebar}
      </aside>

      {/* celular / tablet: barra superior + gaveta */}
      <header
        className="sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 lg:hidden divider"
        style={{ background: "color-mix(in srgb, var(--surface) 92%, transparent)", backdropFilter: "blur(8px)" }}
      >
        <button type="button" className="btn-ghost h-10 w-10 px-0" aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <span className="flex items-center gap-2 font-semibold">
          <Radar className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden /> Radar
        </span>
        <ThemeToggle compact />
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-slate-950/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r shadow-xl divider" style={{ background: "var(--surface)" }}>
            <button type="button" aria-label="Fechar menu" className="btn-ghost absolute right-3 top-3 h-10 w-10 px-0" onClick={() => setOpen(false)}>
              <X className="h-5 w-5" aria-hidden />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
