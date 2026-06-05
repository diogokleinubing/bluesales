-- ============================================================================
-- Módulo Pesquisa — Guichê Web ativo e sem cidades (a listagem cobre todas).
-- Paginação por offset (config.offset).
-- ============================================================================

update crawler_sources
set ativo = true, metodo = 'edge_api', config = (config - 'cidades') || jsonb_build_object('offset', 0)
where slug = 'guicheweb';
