-- ============================================================================
-- Módulo Pesquisa — fonte Ingresso Nacional (APIs JSON: lista + detalhe POST).
-- Sem cidades; skip-forever por url_evento. Detalhe traz data/local/preço/taxa.
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Ingresso Nacional', 'ingressonacional', 'platform', 'edge_api', true, '{}'::jsonb
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
