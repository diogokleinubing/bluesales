-- ============================================================================
-- Módulo Pesquisa — total de eventos por fonte (para a tela de Sites).
-- ============================================================================

create or replace function crawler_source_counts()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_object_agg(source_id, total), '{}'::jsonb)
  from (select source_id, count(*) as total from crawled_events group by source_id) t;
$$;

grant execute on function crawler_source_counts() to authenticated;
