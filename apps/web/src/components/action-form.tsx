"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";
import type { ActionState } from "@/lib/forms";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/** Formulário ligado a uma Server Action, com mensagem de erro/sucesso e reset opcional. */
export function ActionForm({
  action,
  children,
  submitLabel = "Salvar",
  resetOnSuccess = false,
  className,
  variant = "primary",
}: {
  action: Action;
  children: React.ReactNode;
  submitLabel?: string;
  resetOnSuccess?: boolean;
  className?: string;
  variant?: "primary" | "secondary";
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);

  // Submissão manual (em vez de <form action>): o React 19 limpa os campos não controlados
  // ao fim de toda ação de formulário, o que apagaria o que foi digitado quando há erro.
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  };

  return (
    <form ref={ref} onSubmit={onSubmit} className={className ?? "space-y-4"}>
      {children}
      <div className="flex items-center gap-3">
        <SubmitButton label={submitLabel} pending={pending} variant={variant} />
        {/* mensagens entram com um esmaecimento e são anunciadas a leitores de tela */}
        <span role="status" aria-live="polite" className="contents">
          {state?.error && (
            <span key={state.error} className="anim-fade-in text-sm text-red-700 dark:text-red-400">
              {state.error}
            </span>
          )}
          {state?.ok && !pending && (
            <span key={state.ok} className="anim-fade-in text-sm text-emerald-700 dark:text-emerald-400">
              {state.ok}
            </span>
          )}
        </span>
      </div>
    </form>
  );
}

export function SubmitButton({ label, pending: pendingProp, variant = "primary" }: { label: string; pending?: boolean; variant?: "primary" | "secondary" }) {
  const { pending: formPending } = useFormStatus();
  const pending = pendingProp ?? formPending;
  return (
    <button className={variant === "primary" ? "btn" : "btn-secondary"} disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending ? "Salvando..." : label}
    </button>
  );
}

/** Botão de excluir com confirmação. */
export function DeleteButton({ action, label = "Excluir", confirmText = "Tem certeza?" }: { action: () => Promise<void>; label?: string; confirmText?: string }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <button className="btn-ghost h-10 min-h-10 px-2.5 text-xs text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300">
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        {label}
      </button>
    </form>
  );
}
