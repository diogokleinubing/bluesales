-- ============================================================================
-- Módulo Pesquisa — fonte Bilheteria Express (teatro, stand-up, shows, infantil).
-- Listagem AJAX paginada + enriquecimento por página de detalhe.
-- Cobertura por janela de páginas (config.pagina); o "Rodar em lote" cobre tudo.
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Bilheteria Express', 'bilheteriaexpress', 'platform', 'edge_html', true, '{}'::jsonb
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
