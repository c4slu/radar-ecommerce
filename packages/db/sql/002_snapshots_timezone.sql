-- Fase 2: o agregado diário passa a usar o dia de Brasília (antes usava o dia em UTC,
-- então coletas depois das 21h caíam no dia seguinte). Idempotente.
create or replace function public.aggregate_market_snapshots(p_day date default (now() at time zone 'America/Sao_Paulo')::date)
returns integer language plpgsql as $$
declare
  n integer;
  day_start timestamptz := (p_day::timestamp at time zone 'America/Sao_Paulo');
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
    where collected_at >= day_start and collected_at < day_start + interval '1 day'
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
