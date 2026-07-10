-- ============================================================================
-- CRM — flag de "trabalho ativo de relacionamento"
-- Marca, por entidade (organização, local, evento), se estamos em trabalho
-- ativo de relacionamento. Independente do estágio do funil.
-- A "saúde" (tem próxima ação / atrasada / sem ação) NÃO é coluna: é derivada
-- das activities pendentes em tempo de consulta.
-- Backfill: todos começam como false ("Fora de trabalho"); o time liga à mão.
-- ============================================================================

alter table organizations add column if not exists em_trabalho_relacionamento boolean not null default false;
alter table crm_locals    add column if not exists em_trabalho_relacionamento boolean not null default false;
alter table crm_events     add column if not exists em_trabalho_relacionamento boolean not null default false;
