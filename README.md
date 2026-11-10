# Radar

App pessoal para apoiar um e-commerce com estoque próprio (Mercado Livre, Shopee, TikTok Shop):
fornecedores, cotações, estoque, monitoramento de preços/tendências e **score de risco** por produto.

Plano completo: veja o arquivo de plano aprovado. Status: **Fase 1 (cadastros) concluída**: fornecedores, produtos, cotações, estoque e configurações.

## Estrutura

```
apps/web/              Next.js 16 (dashboard, login, calculadora de risco)
packages/core/         margem, tarifas e score de risco (funções puras + testes)
packages/db/           schema Drizzle + SQL pós-migração (RLS, pg_cron, seeds)
packages/collectors/   jobs de coleta (rodam no GitHub Actions)
.github/workflows/     ci + crons
```

## Rodar localmente (sem banco)

```bash
npm install
npm test
npm run dev
```

Abra http://localhost:3000/calculadora. Sem `.env` o app roda só em modo desenvolvimento, sem login.

## Rodar tudo local (banco de desenvolvimento + login do ML)

Produção (Vercel) e desenvolvimento usam **bancos separados**: o local nunca grava no banco de produção.

1. **Banco dev**: crie um segundo projeto grátis no Supabase (`radar-dev`), ative **pg_cron** em Database > Extensions.
2. Crie `.env.local` na raiz (ele vence o `.env`; ambos ficam fora do git):
   ```
   RADAR_ENV=dev
   NEXT_PUBLIC_SUPABASE_URL=...        # do radar-dev
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...   # do radar-dev
   DATABASE_URL=...                    # do radar-dev, Session pooler (porta 5432)
   ML_REDIRECT_URI=https://radar.localtest.me:3000/api/ml/callback
   ```
3. `npm run db:setup` cria as tabelas, funções, RLS, pg_cron e seeds no banco do `.env.local`.
4. No Supabase dev, Authentication > URL Configuration: Site URL `https://radar.localtest.me:3000` e Redirect URL `https://radar.localtest.me:3000/**`.
5. No app do Mercado Livre (developers.mercadolivre.com.br), adicione a URI de redirect
   `https://radar.localtest.me:3000/api/ml/callback` **no mesmo app** que tem a permissão de catálogo.
   (O ML recusa `localhost`; `radar.localtest.me` é um domínio público que aponta para 127.0.0.1, o seu computador.)
6. `npm run dev:https` (na primeira vez o Next gera e instala um certificado local; confirme) e abra
   **`https://radar.localtest.me:3000`** (não use localhost: o login do ML volta para esse endereço). O navegador avisa que o
   certificado não é deste nome: clique em Avançado > Continuar (só na primeira vez). A barra lateral mostra o selo **DEV**. Em Configurações, conecte o Mercado Livre.
7. Popule as oportunidades: `npm run collect:opportunities -- --sync` e depois
   `npm run collect:opportunities -- --limit 10` (ou sem `--limit` para tudo, ~1h).

Se o selo da barra lateral mostrar **LOCAL • banco de produção**, falta o `.env.local`.

## Configurar os serviços gratuitos

1. **Supabase** (supabase.com, plano Free, região São Paulo)
   - Copie `.env.example` para `.env` e preencha `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `DATABASE_URL` (Connect > **Session pooler**, porta 5432) e `ALLOWED_EMAIL`.
   - `npm run db:migrate` para criar as tabelas (a migration inicial já está em `packages/db/migrations`).
   - Database > Extensions: ative **pg_cron**. Depois rode `packages/db/sql/001_after_migrate.sql` no SQL Editor
     (liga RLS, cria agregação diária, limpeza e seeds).
   - Authentication > URL Configuration: adicione `http://localhost:3000/auth/callback` (e a URL da Vercel depois).
   - Faça o primeiro login e então desative novos cadastros em Authentication > Sign In / Providers.
2. **GitHub**: crie um repositório **privado**, faça push e adicione o secret `DATABASE_URL`
   (Settings > Secrets and variables > Actions). Rode o workflow `collect-fx` manualmente para testar.
3. **Vercel** (Hobby): importe o repositório, Root Directory = `apps/web`, e cadastre as mesmas variáveis do `.env`.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | app em http://localhost:3000 |
| `npm test` | testes do score/margem |
| `npm run typecheck` | checagem de tipos de todos os pacotes |
| `npm run db:generate` / `db:migrate` | gera / aplica migrations |
| `npm run collect:fx -- --dry-run` | testa a coleta de câmbio sem gravar |
| `npm run db:setup` | cria/atualiza tabelas, funções e seeds no banco do .env.local (ou .env) |
| `npm run dev:https` | app em https://localhost:3000 (necessário para conectar o ML localmente) |
| `npm run collect:opportunities` | mais vendidos + concorrência no catálogo do ML (`--sync`, `--limit N`, `--dry-run`) |

## Próximas fases

1. ~~Cadastros: fornecedores (CNPJ via BrasilAPI), produtos, cotações, estoque, tarifas.~~ (feito)
2. Mercado Livre: OAuth, coletor, snapshots, gráficos, tela de pesquisa.
3. Score diário + alertas no Telegram.
4. Shopee (API de afiliados), Google Trends, câmbio no custo de importação.
5. TikTok Creative Center + IA opcional.

> As tarifas cadastradas nos seeds e na calculadora são **exemplos**. Confira os valores atuais na central de
> vendedor de cada marketplace.
