-- ============================================================================
-- Módulo Pesquisa — fonte Disk Ingressos (Elasticsearch público).
-- Sem cidades (a busca cobre todas); paginação por offset.
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Disk Ingressos', 'diskingressos', 'platform', 'edge_api', true,
       jsonb_build_object('offset', 0, 'scan', 150)
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
