-- ============================================================================
-- Módulo Pesquisa — categoria do evento (vinda da fonte, ex.: Sympla
-- eventsCategory.description). Texto livre; usada para exibição/filtro.
-- ============================================================================

alter table crawled_events
  add column if not exists categoria text;

create index if not exists crawled_events_categoria_idx
  on crawled_events (categoria);
