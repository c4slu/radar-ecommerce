import { NextResponse, type NextRequest } from "next/server";
import { authorizationUrl, createPkce } from "@radar/ml";
import { requireUser } from "@/lib/auth";
import { mlRedirectUri } from "@/lib/ml";

/** Inicia o OAuth do Mercado Livre: guarda state + PKCE em cookie e redireciona. */
export async function GET(request: NextRequest) {
  await requireUser();
  const redirectUri = mlRedirectUri(request.nextUrl.origin);
  if (!redirectUri.startsWith("https://")) {
    return NextResponse.redirect(new URL("/configuracoes?ml=https", request.url));
  }
  const { verifier, challenge, state } = createPkce();
  const res = NextResponse.redirect(authorizationUrl(redirectUri, state, challenge));
  res.cookies.set("ml_oauth", JSON.stringify({ verifier, state }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/ml",
    maxAge: 600,
  });
  return res;
}
