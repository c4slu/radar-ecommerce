import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@radar/ml";
import { requireUser } from "@/lib/auth";
import { mlRedirectUri } from "@/lib/ml";

/** Retorno do OAuth do Mercado Livre: confere o state, troca o code por tokens e grava. */
export async function GET(request: NextRequest) {
  await requireUser();
  const back = (status: string, detail?: string) => {
    const url = new URL("/configuracoes", request.url);
    url.searchParams.set("ml", status);
    if (detail) url.searchParams.set("detalhe", detail.slice(0, 200));
    const res = NextResponse.redirect(url);
    res.cookies.delete({ name: "ml_oauth", path: "/api/ml" });
    return res;
  };

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back("erro", params.get("error_description") ?? params.get("error")!);
  const code = params.get("code");
  let saved: { verifier?: string; state?: string } = {};
  try {
    saved = JSON.parse(request.cookies.get("ml_oauth")?.value ?? "{}");
  } catch {}
  if (!code || !saved.state || saved.state !== params.get("state") || !saved.verifier) {
    return back("erro", "Sessão de conexão expirada ou inválida. Tente de novo.");
  }
  try {
    const { nickname } = await exchangeCode(code, mlRedirectUri(request.nextUrl.origin), saved.verifier);
    return back("ok", nickname);
  } catch (err) {
    return back("erro", (err as Error).message);
  }
}
