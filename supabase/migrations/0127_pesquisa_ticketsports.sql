-- ============================================================================
-- Módulo Pesquisa — fonte Ticket Sports (provas esportivas).
-- Lista JSON pública (api/events/list). Cobertura por janela (config.offset).
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Ticket Sports', 'ticketsports', 'platform', 'edge_html', true, '{}'::jsonb
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
