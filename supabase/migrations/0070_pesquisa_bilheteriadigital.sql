-- ============================================================================
-- Módulo Pesquisa — Bilheteria Digital ativa e sem cidades (a busca cobre
-- todas; o scraper roda uma vez varrendo todas as páginas).
-- ============================================================================

update crawler_sources
set ativo = true, config = (config - 'cidades')
where slug = 'bilheteriadigital';
