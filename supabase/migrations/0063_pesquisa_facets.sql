-- ============================================================================
-- Módulo Pesquisa — valores distintos para os filtros (cidades/categorias),
-- calculados sobre TODA a base (não só a página carregada).
-- ============================================================================

create or replace function crawled_event_facets()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'cidades', (
      select coalesce(jsonb_agg(distinct cidade order by cidade), '[]'::jsonb)
      from crawled_events where cidade is not null and cidade <> ''
    ),
    'categorias', (
      select coalesce(jsonb_agg(distinct categoria order by categoria), '[]'::jsonb)
      from crawled_events where categoria is not null and categoria <> ''
    )
  );
$$;

grant execute on function crawled_event_facets() to authenticated;
