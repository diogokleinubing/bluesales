-- ============================================================================
-- Módulo Pesquisa — fonte Ingresso Digital (HTML server-side, sem API).
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Ingresso Digital', 'ingressodigital', 'platform', 'edge_html', true,
       jsonb_build_object('pg', 1)
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
