-- ============================================================================
-- Módulo Pesquisa — fonte TicketCenter (eticketcenter.com.br).
-- Site .NET, HTML SSR servido em ISO-8859-1. Sem `cidades` no config: o
-- scraper varre a listagem paginada /eventos/?&Pagina=N em blocos
-- (`pagina` = cursor da página atual, `paginas_por_run` = páginas por
-- execução, `detalhes_por_run` = teto de detalhes por execução). O cursor
-- avança a cada run e dá wrap ao chegar na última página.
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'TicketCenter', 'ticketcenter', 'platform', 'edge_html', true,
       jsonb_build_object('pagina', 1, 'paginas_por_run', 3, 'detalhes_por_run', 60)
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
