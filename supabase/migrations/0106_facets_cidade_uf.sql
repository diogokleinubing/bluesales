-- ============================================================================
-- Facets dos eventos: cidades agora vêm com a UF (pares distintos cidade+uf) e
-- adiciona a lista de estados (ufs). Categorias deixam de ser facet (viraram
-- busca por texto na tela), mas mantém-se a chave por compatibilidade.
-- ============================================================================

create or replace function crawled_event_facets()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'cidades', (
      select coalesce(jsonb_agg(jsonb_build_object('cidade', cidade, 'uf', uf)), '[]'::jsonb)
      from (
        select distinct cidade, uf
        from crawled_events
        where cidade is not null and cidade <> ''
        order by cidade, uf
      ) t
    ),
    'ufs', (
      select coalesce(jsonb_agg(distinct uf order by uf), '[]'::jsonb)
      from crawled_events where uf is not null and uf <> ''
    ),
    'categorias', '[]'::jsonb
  );
$$;

grant execute on function crawled_event_facets() to authenticated;
