-- ============================================================================
-- Módulo Pesquisa — reposiciona o cursor do Bileto numa faixa densa de IDs
-- (próxima dos eventos atuais) e amplia a varredura. A partir daqui o cursor
-- avança sozinho para o último ID válido encontrado.
-- ============================================================================

update crawler_sources
set config = config || jsonb_build_object('id_cursor', 120000, 'scan', 1500)
where slug = 'bileto';
