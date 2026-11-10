import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  action,
  icon: Icon,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 sm:grid dark:bg-brand-500/15 dark:text-brand-400">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
          {subtitle && <p className="muted mt-1 text-sm">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  name,
  hint,
  className,
  ...props
}: { label: string; name: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="label">{label}</span>
      <input name={name} className="input" {...props} />
      {hint && <span className="muted mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

export function SelectField({
  label,
  name,
  options,
  className,
  ...props
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="label">{label}</span>
      <select name={name} className="input" {...props}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextArea({ label, name, ...props }: { label: string; name: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea name={name} className="input min-h-20 py-2" {...props} />
    </label>
  );
}

const BADGE_TONES = {
  zinc: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  amber: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  red: "bg-red-50 text-red-800 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30",
  blue: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30",
} as const;

export function Badge({ children, tone = "zinc" }: { children: React.ReactNode; tone?: keyof typeof BADGE_TONES }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({ children, icon: Icon }: { children: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      {Icon && (
        <span className="surface-2 grid h-10 w-10 place-items-center rounded-full">
          <Icon className="muted h-5 w-5" aria-hidden />
        </span>
      )}
      <p className="muted max-w-sm text-sm">{children}</p>
    </div>
  );
}

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  return (
    <Link href={href} className={variant === "primary" ? "btn" : "btn-secondary"}>
      {children}
    </Link>
  );
}

/** Card de indicador (KPI) do padrão data-dense: rótulo, valor grande e contexto. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "brand" | "blue" | "amber" | "red" | "slate";
  href?: string;
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400",
    blue: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    red: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="muted text-sm">{label}</span>
        {Icon && (
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="muted mt-1 text-xs">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card card-hover block">
      {body}
    </Link>
  ) : (
    <div className="card">{body}</div>
  );
}

/** Cabeçalho de seção dentro de um card. */
export function CardTitle({ children, action, subtitle }: { children: React.ReactNode; action?: React.ReactNode; subtitle?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold">{children}</h2>
        {subtitle && <p className="muted mt-0.5 text-xs">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={`muted px-3 py-2.5 text-xs font-medium uppercase tracking-wide ${right ? "text-right" : "text-left"}`}>{children}</th>;
}

export function Td({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-3 py-2.5 ${right ? "text-right tabular-nums" : ""} ${className ?? ""}`}>{children}</td>;
}

export const STATUS_TONE = { pesquisa: "blue", aprovado: "amber", ativo: "green", descontinuado: "zinc" } as const;

/** Rótulos legíveis para os valores internos (nunca mostrar "mercadolivre", "saida"...). */
export const STATUS_LABEL = { pesquisa: "Em pesquisa", aprovado: "Aprovado", ativo: "Ativo", descontinuado: "Descontinuado" } as const;
export const MOVEMENT_LABEL = { entrada: "Entrada", saida: "Saída", ajuste: "Ajuste" } as const;
export const MARKETPLACE_LABEL: Record<string, string> = { mercadolivre: "Mercado Livre", shopee: "Shopee", tiktokshop: "TikTok Shop" };
