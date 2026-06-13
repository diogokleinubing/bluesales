-- ============================================================================
-- Módulo Pesquisa — fonte Shotgun (shotgun.live), eventos eletrônicos/raves.
-- Sem `cidades` no config: o scraper descobre as cidades do Brasil via
-- /api/data/areas-by-country e varre em blocos (config.city_cursor avança a
-- cada execução, com wrap no fim). `cidades_por_run` = tamanho do bloco.
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Shotgun', 'shotgun', 'platform', 'edge_html', true,
       jsonb_build_object('city_cursor', 0, 'cidades_por_run', 8)
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
