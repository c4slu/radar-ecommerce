-- Oportunidades: limpeza dos rankings e retratos diários antigos (cabe no plano grátis).
-- Idempotente. O RLS das tabelas novas é ligado pelo 001 (loop em todas as tabelas).
create or replace function public.cleanup_old_data()
returns void language sql as $$
  delete from public.market_listings where collected_at < now() - interval '90 days';
  delete from public.job_runs where started_at < now() - interval '60 days';
  delete from public.ml_bestseller_ranks where day < current_date - 120;
  delete from public.ml_offer_snapshots where day < current_date - 120;
  delete from public.ml_fee_cache where fetched_at < now() - interval '30 days';
$$;
