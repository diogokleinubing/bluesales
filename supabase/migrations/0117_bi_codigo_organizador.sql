-- ============================================================================
-- BI passa a identificar o organizador por CÓDIGO (Blueticket), não por nome.
--   - events.codigo_organizador (int): código cru vindo da planilha.
--   - events.organizador_org_id (uuid): organização do nosso sistema, resolvida
--     do codigo_organizador (= organizations.blueticket_code). Relatórios agrupam
--     pela PRINCIPAL via organizations.parent_id.
-- ============================================================================

alter table events
  add column if not exists codigo_organizador int,
  add column if not exists organizador_org_id uuid references organizations(id) on delete set null;

create index if not exists events_org_codorg_idx on events (org_id, codigo_organizador);
create index if not exists events_org_orgid_idx on events (org_id, organizador_org_id);

-- Resolve organizador_org_id a partir do codigo_organizador (re-executável).
create or replace function resolve_event_organizers(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  -- Vincula ao código existente.
  update events e
    set organizador_org_id = o.id
  from organizations o
  where e.org_id = p_org
    and e.codigo_organizador is not null
    and o.org_id = p_org
    and o.blueticket_code = e.codigo_organizador
    and e.organizador_org_id is distinct from o.id;
  get diagnostics n = row_count;

  -- Zera vínculos órfãos (código sem organização correspondente).
  update events e
    set organizador_org_id = null
  where e.org_id = p_org
    and e.organizador_org_id is not null
    and not exists (
      select 1 from organizations o
      where o.id = e.organizador_org_id and o.org_id = p_org
    );

  return n;
end $$;

grant execute on function resolve_event_organizers(uuid) to authenticated;
