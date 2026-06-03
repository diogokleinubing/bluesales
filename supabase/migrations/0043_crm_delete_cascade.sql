-- ============================================================================
-- CRM — comportamento de exclusão (ON DELETE) para permitir remover
-- Organizações, Contatos e Oportunidades com dados vinculados.
--
-- Semântica:
--   Excluir ORGANIZAÇÃO  -> remove em cascata oportunidades, atividades,
--                           tarefas e vínculos org↔pessoa; desvincula
--                           eventos/artistas que apenas referenciavam a org.
--   Excluir CONTATO      -> remove vínculos (org_persons), conexões e
--                           participações em atividades.
--   Excluir OPORTUNIDADE -> preserva atividades/tarefas (apenas desvincula).
-- ============================================================================

-- --- Dependentes de ORGANIZATION ------------------------------------------
alter table org_persons drop constraint if exists org_persons_organization_id_fkey;
alter table org_persons add constraint org_persons_organization_id_fkey
  foreign key (organization_id) references organizations(id) on delete cascade;

alter table opportunities drop constraint if exists opportunities_organization_id_fkey;
alter table opportunities add constraint opportunities_organization_id_fkey
  foreign key (organization_id) references organizations(id) on delete cascade;

alter table activities drop constraint if exists activities_organization_id_fkey;
alter table activities add constraint activities_organization_id_fkey
  foreign key (organization_id) references organizations(id) on delete cascade;

alter table tasks drop constraint if exists tasks_organization_id_fkey;
alter table tasks add constraint tasks_organization_id_fkey
  foreign key (organization_id) references organizations(id) on delete cascade;

alter table crm_events drop constraint if exists crm_events_organization_id_fkey;
alter table crm_events add constraint crm_events_organization_id_fkey
  foreign key (organization_id) references organizations(id) on delete set null;

alter table artists drop constraint if exists artists_organization_id_fkey;
alter table artists add constraint artists_organization_id_fkey
  foreign key (organization_id) references organizations(id) on delete set null;

-- --- Dependentes de PERSON --------------------------------------------------
alter table org_persons drop constraint if exists org_persons_person_id_fkey;
alter table org_persons add constraint org_persons_person_id_fkey
  foreign key (person_id) references persons(id) on delete cascade;

alter table contact_connections drop constraint if exists contact_connections_person_a_id_fkey;
alter table contact_connections add constraint contact_connections_person_a_id_fkey
  foreign key (person_a_id) references persons(id) on delete cascade;

alter table contact_connections drop constraint if exists contact_connections_person_b_id_fkey;
alter table contact_connections add constraint contact_connections_person_b_id_fkey
  foreign key (person_b_id) references persons(id) on delete cascade;

-- --- Dependentes de OPPORTUNITY (preservar histórico, apenas desvincular) ---
alter table activities drop constraint if exists activities_opportunity_id_fkey;
alter table activities add constraint activities_opportunity_id_fkey
  foreign key (opportunity_id) references opportunities(id) on delete set null;

alter table tasks drop constraint if exists tasks_opportunity_id_fkey;
alter table tasks add constraint tasks_opportunity_id_fkey
  foreign key (opportunity_id) references opportunities(id) on delete set null;

-- --- Robustez para exclusão de cadastros de apoio já existentes -------------
-- (evento/artista/local referenciados por oportunidade não bloqueiam a exclusão)
alter table opportunities drop constraint if exists opportunities_crm_event_id_fkey;
alter table opportunities add constraint opportunities_crm_event_id_fkey
  foreign key (crm_event_id) references crm_events(id) on delete set null;

alter table opportunities drop constraint if exists opportunities_artist_id_fkey;
alter table opportunities add constraint opportunities_artist_id_fkey
  foreign key (artist_id) references artists(id) on delete set null;

alter table crm_events drop constraint if exists crm_events_local_id_fkey;
alter table crm_events add constraint crm_events_local_id_fkey
  foreign key (local_id) references crm_locals(id) on delete set null;
