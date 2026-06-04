-- ============================================================================
-- Módulo Pesquisa — capacidade e vendas (vindas do Bileto: total_capacity /
-- total_booked). Úteis para olhar eventos por porte/volume.
-- ============================================================================

alter table crawled_events
  add column if not exists capacidade_total int,
  add column if not exists vendidos int;
