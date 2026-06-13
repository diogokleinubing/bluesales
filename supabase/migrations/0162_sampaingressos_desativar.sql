-- ============================================================================
-- Módulo Pesquisa — desativa a fonte Sampa Ingressos.
-- O site está atrás do "managed challenge" do Cloudflare (HTTP 403 com
-- cf-mitigated: challenge e a página "Just a moment..."), que exige execução
-- de JavaScript no navegador. A Edge Function usa fetch puro e não resolve o
-- desafio, então a listagem volta vazia (0 eventos). Mesmo caso do Shotgun.
-- O código do scraper permanece; reativar é só marcar ativo=true quando houver
-- um caminho de coleta com execução de JS (browser/worker) ou cf_clearance.
-- ============================================================================

update crawler_sources set ativo = false where slug = 'sampaingressos';
