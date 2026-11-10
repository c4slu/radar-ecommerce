"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "radar-theme";

/** Script que roda antes da pintura: aplica o tema salvo (ou o do sistema) sem piscar. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.classList.toggle("dark",t==="dark")}catch(e){}})()`;

function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Botão de tema claro/escuro. Lembra a escolha neste navegador. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => setTheme(readTheme()), []);

  const toggle = () => {
    const next: Theme = readTheme() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // armazenamento bloqueado: o tema vale só para esta página
    }
    setTheme(next);
  };

  const isDark = theme === "dark";
  const label = theme == null ? "Alternar tema claro/escuro" : isDark ? "Mudar para o tema claro" : "Mudar para o tema escuro";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={compact ? "btn-ghost h-10 w-10 px-0" : "btn-ghost w-full justify-start"}
    >
      {/* antes de montar não sabemos o tema: reserva o espaço do ícone para não deslocar o layout */}
      {theme == null ? <span className="h-4 w-4" /> : isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
      {!compact && <span>{theme == null ? "Tema" : isDark ? "Tema claro" : "Tema escuro"}</span>}
    </button>
  );
}
