-- ============================================================================
-- Módulo Pesquisa — fonte Meaple (meaple.com.br).
-- API JSON aberta: sitemap de eventos -> detalhe /v1/channels/.. + /events/<id>/tickets.
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Meaple', 'meaple', 'platform', 'edge_api', true, '{}'::jsonb
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
