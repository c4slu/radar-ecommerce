import type { NextRequest } from "next/server";

/**
 * Endereço público pelo qual o usuário acessou o app. No modo dev o Next reescreve
 * request.url / nextUrl para "localhost", mesmo acessando por radar.localtest.me;
 * por isso o host vem dos cabeçalhos (x-forwarded-host na Vercel, host no local).
 */
export function publicOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return request.nextUrl.origin;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}
