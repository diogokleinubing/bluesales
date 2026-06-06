-- ============================================================================
-- Módulo Pesquisa — fonte Uhuu (busca HTML SSR + API pública de setores p/ preço).
-- Cobertura por cursor de paginação (config.pagina). Sem cidades.
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Uhuu', 'uhuu', 'platform', 'edge_html', true, '{}'::jsonb
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
