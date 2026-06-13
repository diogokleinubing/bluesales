-- ============================================================================
-- Módulo Pesquisa — fonte Minha Entrada (minhaentrada.com.br).
-- Agenda multi-estado (SC, RS, PR, SP, RJ, MG, MS, BA), HTML server-rendered
-- (swoole), sem Cloudflare. Descoberta via /agenda-geral + paginação POST
-- (CSRF Laravel); por evento, GET /evento/<slug> (data ISO, cidade/UF, lat/long,
-- descrição, imagem) + POST /ajax/evento/<slug>/render-tickets/ (preços).
-- Incremental: `max_paginas` e `detalhes_por_run` opcionais no config
-- (default: 40 páginas; 40 eventos/execução).
-- ============================================================================

insert into crawler_sources (org_id, nome, slug, tipo, metodo, ativo, config)
select o.id, 'Minha Entrada', 'minhaentrada', 'platform', 'edge_html', true,
       jsonb_build_object('max_paginas', 40, 'detalhes_por_run', 40)
from orgs o
where o.id = (select id from orgs order by created_at limit 1)
on conflict (org_id, slug) do nothing;
