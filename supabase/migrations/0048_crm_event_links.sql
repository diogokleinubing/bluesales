-- ============================================================================
-- CRM — campos de site e instagram na base de eventos.
-- ============================================================================

alter table crm_events
  add column if not exists site text,
  add column if not exists instagram text;
