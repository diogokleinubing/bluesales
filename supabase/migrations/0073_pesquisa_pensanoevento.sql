-- ============================================================================
-- Módulo Pesquisa — fonte Pensa no Evento (API JSON de busca + HTML do evento).
-- Sem cidades; paginação por cursor (salvo em config.cursor).
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Pensa no Evento', 'pensanoevento', 'platform', 'edge_api', true, '{}'::jsonb
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
