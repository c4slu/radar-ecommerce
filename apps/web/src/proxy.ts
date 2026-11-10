import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "./lib/origin";

const PUBLIC_PATHS = ["/login", "/auth"];

/** Renova a sessão do Supabase e bloqueia tudo que não seja o e-mail autorizado. */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Sem Supabase configurado: só permite rodar em desenvolvimento local.
    if (process.env.NODE_ENV === "development") return NextResponse.next();
    return new NextResponse("Supabase não configurado", { status: 503 });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  const allowed = !!user?.email && user.email.toLowerCase() === process.env.ALLOWED_EMAIL?.toLowerCase();

  if (!allowed && !isPublic) {
    if (user) await supabase.auth.signOut();
    // origem pelos cabeçalhos: no dev o nextUrl vem como localhost mesmo acessando por radar.localtest.me
    return NextResponse.redirect(new URL("/login", publicOrigin(request)));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
