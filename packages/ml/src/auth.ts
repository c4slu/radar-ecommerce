import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, integrationTokens } from "@radar/db";

export const ML_PROVIDER = "mercadolivre";
const AUTH_URL = "https://auth.mercadolivre.com.br/authorization";
export const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
/** renova quando faltar menos que isso para expirar */
const REFRESH_MARGIN_MS = 10 * 60_000;

export class MlError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: unknown,
  ) {
    super(message);
  }
}

function credentials() {
  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new MlError("ML_CLIENT_ID/ML_CLIENT_SECRET não definidos no .env");
  return { clientId, clientSecret };
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  user_id?: number;
  scope?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new MlError(`ML oauth/token ${res.status}: ${JSON.stringify(body)}`, res.status, body);
  return body as TokenResponse;
}

// ---------- Fluxo de autorização (OAuth com PKCE) ----------

export function createPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  return { verifier, challenge, state };
}

export function authorizationUrl(redirectUri: string, state: string, challenge: string) {
  const { clientId } = credentials();
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

/** Troca o `code` do callback por tokens e grava em integration_tokens. */
export async function exchangeCode(code: string, redirectUri: string, verifier: string) {
  const { clientId, clientSecret } = credentials();
  const t = await tokenRequest({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const me = await fetch("https://api.mercadolibre.com/users/me", {
    headers: { Authorization: `Bearer ${t.access_token}` },
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  await saveToken(t, { userId: t.user_id, nickname: me?.nickname, scope: t.scope });
  return { nickname: me?.nickname as string | undefined };
}

async function saveToken(t: TokenResponse, meta: Record<string, unknown>, db = getDb()) {
  const row = {
    provider: ML_PROVIDER,
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    meta,
    updatedAt: new Date(),
  };
  const { provider: _p, ...update } = row;
  await db.insert(integrationTokens).values(row).onConflictDoUpdate({ target: integrationTokens.provider, set: update });
}

// ---------- Uso do token ----------

export interface MlConnection {
  connected: boolean;
  nickname?: string;
  userId?: number;
  expiresAt?: Date | null;
}

export async function getConnection(): Promise<MlConnection> {
  const [row] = await getDb().select().from(integrationTokens).where(eq(integrationTokens.provider, ML_PROVIDER));
  if (!row) return { connected: false };
  const meta = (row.meta ?? {}) as { nickname?: string; userId?: number };
  return { connected: true, nickname: meta.nickname, userId: meta.userId, expiresAt: row.expiresAt };
}

export async function disconnect() {
  memo = null;
  await getDb().delete(integrationTokens).where(eq(integrationTokens.provider, ML_PROVIDER));
}

/**
 * Access token válido, renovando se estiver perto de expirar.
 * O refresh token do ML é de uso único, então a renovação roda dentro de uma transação
 * com SELECT ... FOR UPDATE: se o app e um job renovarem ao mesmo tempo, o segundo espera
 * e reaproveita o token novo em vez de queimar o refresh token antigo.
 */
let memo: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

export async function getAccessToken(force = false): Promise<string> {
  // Cache em memória: a coleta faz milhares de chamadas e não precisa ir ao banco em cada uma.
  if (!force && memo && memo.expiresAt - Date.now() > REFRESH_MARGIN_MS) return memo.token;
  // Chamadas simultâneas esperam a mesma leitura/renovação em vez de abrir várias transações.
  if (!force && inflight) return inflight;
  const p = loadAccessToken(force).finally(() => {
    if (inflight === p) inflight = null;
  });
  if (!force) inflight = p;
  return p;
}

async function loadAccessToken(force: boolean): Promise<string> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(integrationTokens)
      .where(eq(integrationTokens.provider, ML_PROVIDER))
      .for("update");
    if (!row) throw new MlError("Mercado Livre não conectado. Conecte em Configurações.", 401);
    const fresh = row.expiresAt && row.expiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS;
    if (fresh && !force) {
      memo = { token: row.accessToken, expiresAt: row.expiresAt!.getTime() };
      return row.accessToken;
    }
    if (!row.refreshToken) throw new MlError("Sem refresh token: reconecte o Mercado Livre em Configurações.", 401);

    const { clientId, clientSecret } = credentials();
    const t = await tokenRequest({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refreshToken,
    });
    await saveToken(t, { ...((row.meta as object) ?? {}), refreshedAt: new Date().toISOString() }, tx as unknown as ReturnType<typeof getDb>);
    memo = { token: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
    return t.access_token;
  });
}
