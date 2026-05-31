-- ============================================================================
-- Limpar agrupamentos de eventos (reset) — server-side, confiável
-- ----------------------------------------------------------------------------
-- O reset via PostgREST (.update/.delete) podia não aplicar como esperado.
-- Esta função zera tudo no Postgres em uma transação: apaga os overrides e
-- limpa events.familia. Retorna quantos eventos foram limpos.
-- ============================================================================

create or replace function clear_event_families(p_org uuid)
returns int
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
as $$
declare
  n int;
begin
  delete from event_family_override where org_id = p_org;

  update events set familia = null
  where org_id = p_org and familia is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function clear_event_families(uuid) from anon, public;
grant execute on function clear_event_families(uuid) to authenticated;
