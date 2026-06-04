-- ============================================================================
-- Módulo Pesquisa — Sympla e Bileto descobrem por sitemap / faixa de ID, não
-- por cidade. Removemos as cidades dessas fontes: sem cidades cadastradas, o
-- scraper não filtra por cidade (só pelos filtros de termo + data).
-- ============================================================================

-- Sympla: sem cidades; varre o sitemap por offset (cobre tudo aos poucos).
update crawler_sources
set config = (config - 'cidades') || jsonb_build_object('sitemap_offset', 0, 'scan', 150)
where slug = 'sympla';

-- Bileto: sem cidades; varredura de IDs mais ampla e cursor mais perto da
-- faixa atual (eventos novos ficam no topo dos IDs).
update crawler_sources
set config = (config - 'cidades') || jsonb_build_object('scan', 1500, 'id_cursor', 120500)
where slug = 'bileto';
