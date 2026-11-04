import "server-only";
import { createClient, isAllowedEmail, supabaseConfigured } from "./supabase/server";

/**
 * Garante que quem chama a Server Action é o usuário autorizado.
 * O proxy já protege as páginas; isto é a segunda barreira para as ações.
 */
export async function requireUser() {
  if (!supabaseConfigured()) {
    if (process.env.NODE_ENV === "development") return null;
    throw new Error("Supabase não configurado");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAllowedEmail(user.email)) throw new Error("Não autorizado");
  return user;
}
