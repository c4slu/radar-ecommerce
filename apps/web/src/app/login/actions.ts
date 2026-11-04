"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, isAllowedEmail, supabaseConfigured } from "@/lib/supabase/server";

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!supabaseConfigured()) redirect("/login?error=" + encodeURIComponent("Supabase não configurado no .env"));
  // Mesmo comportamento para e-mail não autorizado, sem revelar qual é o permitido.
  if (!isAllowedEmail(email)) redirect("/login?sent=1");

  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) redirect("/login?error=" + encodeURIComponent(error.message));
  redirect("/login?sent=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
