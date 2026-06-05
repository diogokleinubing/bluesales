-- ============================================================================
-- Módulo Pesquisa — taxa de conveniência/serviço do site (% médio dos
-- ingressos do evento).
-- ============================================================================

alter table crawled_events
  add column if not exists taxa_pct numeric(5, 2);
