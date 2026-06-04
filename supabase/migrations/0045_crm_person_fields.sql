-- ============================================================================
-- CRM — campos adicionais no contato: instagram e observações.
-- (O "cargo" do contato deixa de ser usado na UI; o papel passa a ser por
--  organização, via org_persons.papel.)
-- ============================================================================

alter table persons
  add column if not exists instagram text,
  add column if not exists observacoes text;
