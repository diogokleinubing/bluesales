-- ============================================================================
-- Preenche events.data_evento a partir das datas vindas nas planilhas de VENDAS
-- ----------------------------------------------------------------------------
-- Quando a planilha de vendas traz a data do evento, criamos/atualizamos o
-- registro do evento APENAS na coluna data_evento (sem apagar nome/local/etc.
-- de eventos já existentes). Usa COALESCE para não sobrescrever uma data já
-- definida por uma importação de eventos explícita.
-- Retorna a quantidade de linhas afetadas.
-- ============================================================================

create or replace function upsert_event_dates(
  p_org uuid, p_codigos text[], p_dates date[]
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  insert into events (org_id, codigo_evento, data_evento)
  select p_org, c, d
  from unnest(p_codigos, p_dates) as t(c, d)
  where c is not null
  on conflict (org_id, codigo_evento)
  do update set data_evento = coalesce(events.data_evento, excluded.data_evento);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function upsert_event_dates(uuid, text[], date[]) from anon, public;
grant execute on function upsert_event_dates(uuid, text[], date[]) to authenticated;
