-- ============================================================================
-- Módulo Pesquisa — país do evento (para separar Brasil x Exterior).
-- Normalizado: BRA/BRASIL/Brazil -> 'Brasil'; demais mantêm o país de origem.
-- ============================================================================

alter table crawled_events
  add column if not exists pais text;

create index if not exists crawled_events_pais_idx on crawled_events (pais);
