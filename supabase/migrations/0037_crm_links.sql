-- ============================================================================
-- CRM Fase 1 — vínculos N:N e objeções polimórficas
-- ============================================================================

create table if not exists org_persons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  organization_id uuid not null references organizations(id),
  person_id uuid not null references persons(id),
  papel text,
  ativo boolean default true,
  data_inicio date,
  data_fim date
);
create index if not exists org_persons_org_idx on org_persons (organization_id);
create index if not exists org_persons_person_idx on org_persons (person_id);

create table if not exists org_segments (
  organization_id uuid references organizations(id) on delete cascade,
  segment_id uuid references segments(id) on delete cascade,
  primary key (organization_id, segment_id)
);

create table if not exists org_platforms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  platform_id uuid not null references platforms(id),
  status text check (status in ('Preferencial','Eventual','Anterior'))
);
create index if not exists org_platforms_org_idx on org_platforms (organization_id);

create table if not exists crm_event_artists (
  crm_event_id uuid references crm_events(id) on delete cascade,
  artist_id uuid references artists(id) on delete cascade,
  primary key (crm_event_id, artist_id)
);

create table if not exists contact_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  person_a_id uuid not null references persons(id),
  person_b_id uuid not null references persons(id),
  comentario text,
  check (person_a_id < person_b_id),
  unique (person_a_id, person_b_id)
);

create table if not exists entity_objections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  objection_id uuid not null references objections(id),
  entity_type text not null check (entity_type in ('organization','person','opportunity')),
  entity_id uuid not null,
  comentario text,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);
create index if not exists entity_objections_entity_idx on entity_objections (entity_type, entity_id);
