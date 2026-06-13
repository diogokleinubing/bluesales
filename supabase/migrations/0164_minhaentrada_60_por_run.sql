-- ============================================================================
-- Módulo Pesquisa — Minha Entrada: eleva o teto para 60 eventos por execução.
-- ============================================================================

update crawler_sources
   set config = jsonb_set(coalesce(config, '{}'::jsonb), '{detalhes_por_run}', '60'::jsonb)
 where slug = 'minhaentrada';
