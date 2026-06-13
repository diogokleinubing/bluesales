-- ============================================================================
-- Módulo Pesquisa — fonte Clube do Ingresso (clubedoingresso.com).
-- SSR Bootstrap4/jQuery. O scraper descobre os eventos na listagem
-- /todoseventos (sem paginação) e abre cada /evento/<slug> para preço,
-- cidade/UF, data e organizador. Sem `cidades` no config: varre a listagem
-- inteira em blocos (`detalhes_por_run` = teto de detalhes por execução;
-- os já coletados viram "known" e o backlog é coberto run após run).
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Clube do Ingresso', 'clubedoingresso', 'platform', 'edge_html', true,
       jsonb_build_object('detalhes_por_run', 80)
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
