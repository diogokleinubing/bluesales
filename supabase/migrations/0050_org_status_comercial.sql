-- ============================================================================
-- CRM — status comercial da organização (Ativo | Eventual | Inativo).
-- ============================================================================

alter table organizations
  add column if not exists status_comercial text
  check (status_comercial in ('Ativo', 'Eventual', 'Inativo'));
