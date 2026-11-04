"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, isAllowedEmail, supabaseConfigured } from "@/lib/supabase/server";

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!supabaseConfigured()) redirect("/login?error=" + encodeURIComponent("Supabase não configurado no .env"));
  // Mesmo comportamento para e-mail não autorizado, sem revelar qual é o permitido.
  if (!isAllowedEmail(email)) {
    // aviso só no log do servidor: a tela não revela qual é o e-mail autorizado
    console.warn(`[login] e-mail fora do ALLOWED_EMAIL, nenhum link enviado: ${email}`);
    redirect("/login?sent=1");
  }

  // Endereço do próprio app (local ou Vercel), para o link do e-mail voltar ao lugar certo.
  // O Supabase só aceita se a URL estiver em Authentication > URL Configuration > Redirect URLs;
  // caso contrário ele usa o Site URL.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = h.get("origin") ?? (host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "http://localhost:3000");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) {
    const msg =
      error.code === "over_email_send_rate_limit" || /rate limit/i.test(error.message)
        ? "Limite de e-mails do Supabase atingido (2 por hora no plano grátis). Tente de novo mais tarde ou configure um SMTP próprio."
        : error.message;
    redirect("/login?error=" + encodeURIComponent(msg));
  }
  redirect("/login?sent=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
