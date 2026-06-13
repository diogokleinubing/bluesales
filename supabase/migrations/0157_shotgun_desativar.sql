-- ============================================================================
-- Módulo Pesquisa — desativa a fonte Shotgun.
-- A shotgun.live está atrás do challenge de bots da Vercel (HTTP 429
-- x-vercel-mitigated: challenge a partir de IPs de datacenter), então a Edge
-- Function não consegue coletar. Desativada para não poluir o "Rodar em lote".
-- O código do scraper permanece; reativar é só marcar ativo=true (UI ou SQL)
-- quando houver um caminho de scraping com execução de JS.
-- ============================================================================

update crawler_sources set ativo = false where slug = 'shotgun';
