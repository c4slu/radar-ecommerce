-- Rodar UMA vez no SQL Editor do Supabase, depois de `npm run db:migrate`.
-- Pode rodar de novo sem problema (é idempotente).

-- 1) RLS ligado em todas as tabelas e SEM policies:
--    a chave anon (exposta no navegador) não lê nem escreve nada pela API REST.
--    O app e os jobs acessam via DATABASE_URL no servidor, que ignora RLS.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- 2) Agregação diária: market_listings -> market_snapshots
create or replace function public.aggregate_market_snapshots(p_day date default current_date)
returns integer language plpgsql as $$
declare n integer;
begin
  insert into public.market_snapshots
    (product_id, marketplace, day, price_min, price_median, price_max, price_stddev,
     listings_count, sellers_count, official_share, sold_total)
  select
    product_id, marketplace, p_day,
    min(price),
    percentile_cont(0.5) within group (order by price),
    max(price),
    coalesce(stddev_pop(price), 0),
    count(distinct external_id),
    count(distinct seller_id),
    avg(case when is_official_store or is_fulfillment then 1 else 0 end),
    sum(sold_quantity)
  from (
    -- último snapshot de cada anúncio no dia
    select distinct on (product_id, marketplace, external_id) *
    from public.market_listings
    where collected_at >= p_day and collected_at < p_day + 1
    order by product_id, marketplace, external_id, collected_at desc
  ) l
  group by product_id, marketplace
  on conflict (product_id, marketplace, day) do update set
    price_min = excluded.price_min,
    price_median = excluded.price_median,
    price_max = excluded.price_max,
    price_stddev = excluded.price_stddev,
    listings_count = excluded.listings_count,
    sellers_count = excluded.sellers_count,
    official_share = excluded.official_share,
    sold_total = excluded.sold_total;
  get diagnostics n = row_count;
  return n;
end $$;

-- 3) Limpeza para caber nos 500 MB do plano grátis
create or replace function public.cleanup_old_data()
returns void language sql as $$
  delete from public.market_listings where collected_at < now() - interval '90 days';
  delete from public.job_runs where started_at < now() - interval '60 days';
$$;

-- 4) Agendamentos com pg_cron (ative a extensão em Database > Extensions > pg_cron)
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname in ('aggregate-snapshots', 'cleanup-old-data');
-- horários em UTC: 02:55 UTC = 23:55 de Brasília
select cron.schedule('aggregate-snapshots', '55 2 * * *', $$select public.aggregate_market_snapshots((now() at time zone 'America/Sao_Paulo')::date)$$);
select cron.schedule('cleanup-old-data', '30 3 * * 0', $$select public.cleanup_old_data()$$);

-- 5) Configurações padrão
insert into public.settings (key, value) values
  ('tax_pct', '0.06'),
  ('target_margin', '0.20'),
  ('expected_share', '0.05'),
  ('coverage_days', '30'),
  ('max_days_to_sell', '90'),
  ('risk_weights', '{"margin":0.3,"volatility":0.15,"competition":0.15,"demand":0.2,"turnover":0.2}')
on conflict (key) do nothing;

-- 6) Tarifas de EXEMPLO. Os valores mudam com frequência:
--    confira na central de vendedor de cada marketplace e ajuste na tela de Configurações.
insert into public.marketplace_fees (marketplace, label, commission_pct, fixed_fee, min_price, max_price)
select * from (values
  ('mercadolivre'::marketplace, 'ML Clássico - abaixo de R$79 (EXEMPLO)', 0.12, 6.75, 0, 79),
  ('mercadolivre'::marketplace, 'ML Clássico - a partir de R$79 (EXEMPLO)', 0.12, 0, 79, null),
  ('shopee'::marketplace, 'Shopee padrão (EXEMPLO)', 0.20, 4.00, 0, null),
  ('tiktokshop'::marketplace, 'TikTok Shop padrão (EXEMPLO)', 0.06, 2.00, 0, null)
) v(marketplace, label, commission_pct, fixed_fee, min_price, max_price)
where not exists (select 1 from public.marketplace_fees);
