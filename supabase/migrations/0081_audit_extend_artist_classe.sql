-- ============================================================================
-- Estende a auditoria para Locais, Artistas e Atividades; e adiciona
-- classificação (A+/A/B/C) na base de Artistas.
-- ============================================================================

-- Mapeamento de tabela -> entity_type (mantém os existentes + novos).
create or replace function crm_entity_type(p_table text)
returns text language sql immutable as $$
  select case p_table
    when 'organizations' then 'organization'
    when 'persons' then 'person'
    when 'opportunities' then 'opportunity'
    when 'crm_events' then 'crm_event'
    when 'tasks' then 'task'
    when 'activities' then 'activity'
    when 'crm_locals' then 'local'
    when 'artists' then 'artist'
    else p_table end;
$$;

-- Triggers de auditoria para as entidades que ainda não tinham.
drop trigger if exists trg_audit on crm_locals;
create trigger trg_audit after insert or update or delete on crm_locals
  for each row execute function crm_audit();

drop trigger if exists trg_audit on artists;
create trigger trg_audit after insert or update or delete on artists
  for each row execute function crm_audit();

drop trigger if exists trg_audit on activities;
create trigger trg_audit after insert or update or delete on activities
  for each row execute function crm_audit();

-- Classificação do artista (mesma escala A+/A/B/C das organizações).
alter table artists add column if not exists classificacao text
  check (classificacao in ('A+', 'A', 'B', 'C'));
