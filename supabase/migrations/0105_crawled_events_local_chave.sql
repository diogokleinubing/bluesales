-- ============================================================================
-- crawled_events.local_chave: mesma "chave" agregada usada em crawled_locals
--   (lower(trim(local_raw)) || '|' || cidade_uf), materializada por trigger.
-- Permite ocultar, na listagem de eventos, os shows de locais marcados como
-- ignorados (crawled_ignored tipo='local'), via filtro `local_chave not in (...)`.
-- ============================================================================

alter table crawled_events add column if not exists local_chave text;

-- Replica EXATAMENTE a chave do crawled_locals (migration 0084/0093).
create or replace function crawled_events_local_chave(p_local text, p_cidade text, p_uf text)
returns text
language sql
immutable
as $$
  select case
    when p_local is null or btrim(p_local) = '' then null
    else lower(btrim(p_local)) || '|' || coalesce(
      case
        when p_cidade is null or p_cidade = '' then null
        else p_cidade || case when p_uf is not null and p_uf <> '' then '/' || p_uf else '' end
      end, '')
  end;
$$;

create or replace function crawled_events_set_local_chave()
returns trigger
language plpgsql
as $$
begin
  new.local_chave := crawled_events_local_chave(new.local_raw, new.cidade, new.uf);
  return new;
end;
$$;

drop trigger if exists crawled_events_local_chave_tg on crawled_events;
create trigger crawled_events_local_chave_tg
  before insert or update of local_raw, cidade, uf on crawled_events
  for each row execute function crawled_events_set_local_chave();

-- Backfill dos já existentes.
update crawled_events
set local_chave = crawled_events_local_chave(local_raw, cidade, uf)
where local_chave is null and local_raw is not null and btrim(local_raw) <> '';

create index if not exists crawled_events_local_chave_idx
  on crawled_events (org_id, local_chave);
