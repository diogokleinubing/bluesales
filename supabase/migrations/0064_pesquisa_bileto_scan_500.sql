-- ============================================================================
-- Módulo Pesquisa — reduz a varredura do Bileto para 500 IDs por execução
-- (mais conservador, garante terminar dentro do tempo da Edge Function).
-- ============================================================================

update crawler_sources
set config = config || jsonb_build_object('scan', 500)
where slug = 'bileto';
