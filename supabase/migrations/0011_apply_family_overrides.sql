-- ============================================================================
-- Aplicar SOMENTE os overrides de família aos eventos (sem sugestão por nome)
-- ----------------------------------------------------------------------------
-- Usado após a importação: garante que eventos recém-importados que já têm um
-- override de família recebam essa família, SEM aplicar a sugestão automática
-- pelo nome aos demais (que repoluiria a base). Idempotente.
-- ============================================================================

create or replace function apply_family_overrides(p_org uuid)
returns int
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
as $$
declare
  n int;
begin
  update events e
  set familia = o.familia
  from event_family_override o
  where e.org_id = p_org
    and o.org_id = p_org
    and o.codigo_evento = e.codigo_evento
    and e.familia is distinct from o.familia;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function apply_family_overrides(uuid) from anon, public;
grant execute on function apply_family_overrides(uuid) to authenticated;
