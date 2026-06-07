-- ============================================================================
-- Cron dedicado do Pensa no Evento (a cada 6h). Roda SÓ a fonte pensanoevento,
-- com orçamento de tempo próprio (sem disputar com as outras 13 fontes), para
-- que a Fase 3 (re-precificação do backlog sem preço) realmente execute.
-- Reaproveita as URLs/keys do Vault (mesmas do trigger_crawler_run).
-- ============================================================================

create or replace function public.trigger_crawler_run_pne()
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
    raise notice 'crawler-run(pne): segredos do Vault ausentes — disparo ignorado';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('source_slug', 'pensanoevento')
  );
end;
$$;

revoke all on function public.trigger_crawler_run_pne() from public, anon, authenticated;

select cron.unschedule('crawler-run-pne-6h')
where exists (select 1 from cron.job where jobname = 'crawler-run-pne-6h');

select cron.schedule(
  'crawler-run-pne-6h',
  '0 */6 * * *',
  $$ select public.trigger_crawler_run_pne(); $$
);

-- Dispara uma rodada imediatamente para começar a curar o backlog agora.
select public.trigger_crawler_run_pne();
