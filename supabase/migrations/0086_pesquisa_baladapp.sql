-- ============================================================================
-- Módulo Pesquisa — fonte BaladaApp (API JSON de anúncios + HTML do evento).
-- Sem cidades; lista os ~150 anúncios mais recentes (skip-forever).
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'BaladaApp', 'baladapp', 'platform', 'edge_api', true, '{}'::jsonb
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
