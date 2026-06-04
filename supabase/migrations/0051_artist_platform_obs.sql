-- ============================================================================
-- CRM — plataforma e observações em artistas; observações em locais.
-- ============================================================================

alter table artists
  add column if not exists platform_id uuid references platforms(id) on delete set null,
  add column if not exists observacoes text;

alter table crm_locals
  add column if not exists observacoes text;
