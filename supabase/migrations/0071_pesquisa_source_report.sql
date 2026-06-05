-- ============================================================================
-- Módulo Pesquisa — relatório por fonte (agregações sobre toda a base).
-- ============================================================================

create or replace function crawler_source_report(p_source uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'total', (select count(*) from crawled_events where source_id = p_source),
    'por_estado', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select uf, count(*) as qtd
        from crawled_events
        where source_id = p_source and uf is not null and uf <> ''
        group by uf order by count(*) desc
      ) t),
    'por_cidade', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select cidade, uf, count(*) as qtd
        from crawled_events
        where source_id = p_source and cidade is not null and cidade <> ''
        group by cidade, uf order by count(*) desc limit 100
      ) t),
    'por_local', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select local_raw as local, cidade, uf, count(*) as qtd
        from crawled_events
        where source_id = p_source and local_raw is not null and local_raw <> ''
        group by local_raw, cidade, uf order by count(*) desc limit 100
      ) t),
    'por_organizador', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select organizador_raw as organizador, count(*) as qtd
        from crawled_events
        where source_id = p_source and organizador_raw is not null and organizador_raw <> ''
        group by organizador_raw order by count(*) desc limit 100
      ) t)
  );
$$;

grant execute on function crawler_source_report(uuid) to authenticated;
