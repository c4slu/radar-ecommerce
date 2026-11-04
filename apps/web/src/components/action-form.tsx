"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/forms";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/** Formulário ligado a uma Server Action, com mensagem de erro/sucesso e reset opcional. */
export function ActionForm({
  action,
  children,
  submitLabel = "Salvar",
  resetOnSuccess = false,
  className,
}: {
  action: Action;
  children: React.ReactNode;
  submitLabel?: string;
  resetOnSuccess?: boolean;
  className?: string;
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
        <SubmitButton label={submitLabel} pending={pending} />
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && !pending && <span className="text-sm text-emerald-600">{state.ok}</span>}
      </div>
    </form>
  );
}

export function SubmitButton({ label, pending: pendingProp }: { label: string; pending?: boolean }) {
  const { pending: formPending } = useFormStatus();
  const pending = pendingProp ?? formPending;
  return (
    <button className="btn disabled:opacity-50" disabled={pending}>
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
      <button className="text-xs text-red-600 hover:underline">{label}</button>
    </form>
  );
}
