-- ============================================================================
-- Módulo Pesquisa — Fase 3: agendamento semanal do crawler (pg_cron + pg_net)
--
-- Segurança: a URL da Edge Function e a service_role key são lidas do Vault
-- em tempo de execução — NADA secreto fica no git. Antes do primeiro disparo,
-- cadastre os dois segredos no Supabase (uma vez):
--
--   select vault.create_secret(
--     'https://<PROJECT_REF>.supabase.co/functions/v1/crawler-run',
--     'crawler_run_url');
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'crawler_service_key');
--
-- Para disparo manual existe o botão "Executar agora" na UI (usa o JWT do
-- Gestor), então o cron é apenas a coleta automática semanal.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Wrapper: dispara a Edge Function crawler-run lendo URL/key do Vault.
create or replace function public.trigger_crawler_run()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'crawler_run_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'crawler_service_key';

  if v_url is null or v_key is null then
    raise notice 'crawler-run: segredos do Vault ausentes (crawler_run_url / crawler_service_key) — disparo ignorado';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.trigger_crawler_run() from public, anon, authenticated;

-- Reagenda de forma idempotente: segunda-feira 06:00 UTC (≈03:00 BRT).
select cron.unschedule('crawler-run-weekly')
where exists (select 1 from cron.job where jobname = 'crawler-run-weekly');

select cron.schedule(
  'crawler-run-weekly',
  '0 6 * * 1',
  $$ select public.trigger_crawler_run(); $$
);
