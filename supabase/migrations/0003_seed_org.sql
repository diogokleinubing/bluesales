-- ============================================================================
-- Seed da org padrão "Blueticket"
-- ----------------------------------------------------------------------------
-- Insere a org apenas se ainda não existir nenhuma. O app descobre o org_id
-- default buscando a primeira org (ou via VITE_DEFAULT_ORG_ID, se setada).
-- ============================================================================

insert into orgs (nome)
select 'Blueticket'
where not exists (select 1 from orgs);
