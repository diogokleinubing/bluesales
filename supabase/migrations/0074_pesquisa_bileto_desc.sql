-- ============================================================================
-- Módulo Pesquisa — Bileto passa a varrer IDs de forma DESCENDENTE (cobre a
-- faixa histórica abaixo de onde começamos). id_baixo começa na fronteira atual.
-- ============================================================================

update crawler_sources
set config = config || jsonb_build_object('id_baixo', 121926, 'id_topo', 122500, 'scan', 2000)
where slug = 'bileto';
