-- ============================================================================
-- Módulo Pesquisa — fontes Ticketmaster Brasil e Ticket360.
-- Ambas são SSR sem API/sitemap: descoberta + detalhe via HTML (JSON-LD).
--   ticketmaster: home + páginas /page/ -> /event/<slug> (schema.org/Event).
--   ticket360: /sub-categoria/<id>/<estado> (ItemList) -> /evento/<id>/<slug>.
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Ticketmaster', 'ticketmaster', 'platform', 'edge_html', true, '{}'::jsonb
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Ticket360', 'ticket360', 'platform', 'edge_html', true, '{}'::jsonb
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
