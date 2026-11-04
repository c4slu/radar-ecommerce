/**
 * URL de retorno do OAuth do ML. Precisa ser https e estar cadastrada igualzinha no app do
 * Mercado Livre (developers.mercadolivre.com.br > sua aplicação > URI de redirect).
 * Defina ML_REDIRECT_URI na Vercel com a URL de produção; sem ela usa a origem atual.
 */
export const mlRedirectUri = (origin: string) => process.env.ML_REDIRECT_URI || `${origin}/api/ml/callback`;
