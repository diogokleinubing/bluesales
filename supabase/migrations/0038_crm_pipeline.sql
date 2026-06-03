-- ============================================================================
-- CRM Fase 1 — oportunidades, atividades e tarefas
-- ============================================================================

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  titulo text not null,
  organization_id uuid not null references organizations(id),
  crm_event_id uuid references crm_events(id),
  artist_id uuid references artists(id),
  stage_id uuid not null references funnel_stages(id),
  owner_id uuid not null references auth.users(id),
  data_prevista_fechamento date,
  gmv_estimado numeric,
  probabilidade int check (probabilidade between 0 and 100),
  observacoes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists opportunities_org_idx on opportunities (org_id);
create index if not exists opportunities_owner_idx on opportunities (owner_id);
create index if not exists opportunities_stage_idx on opportunities (stage_id);
create index if not exists opportunities_organization_idx on opportunities (organization_id);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  tipo text check (tipo in ('Reunião','Ligação','Email','WhatsApp','Nota','Outro')),
  data_hora timestamptz not null default now(),
  titulo text not null,
  resumo text,
  transcricao text,
  transcricao_file_url text,
  author_id uuid not null references auth.users(id),
  organization_id uuid references organizations(id),
  opportunity_id uuid references opportunities(id),
  created_at timestamptz default now()
);
create index if not exists activities_org_idx on activities (org_id);
create index if not exists activities_author_idx on activities (author_id);
create index if not exists activities_organization_idx on activities (organization_id);
create index if not exists activities_opportunity_idx on activities (opportunity_id);
create index if not exists activities_data_idx on activities (data_hora desc);

create table if not exists activity_participants (
  activity_id uuid references activities(id) on delete cascade,
  person_id uuid references persons(id) on delete cascade,
  primary key (activity_id, person_id)
);
create index if not exists activity_participants_person_idx on activity_participants (person_id);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  titulo text not null,
  descricao text,
  owner_id uuid not null references auth.users(id),
  organization_id uuid references organizations(id),
  opportunity_id uuid references opportunities(id),
  data_vencimento date,
  concluida boolean default false,
  concluida_em timestamptz,
  created_at timestamptz default now()
);
create index if not exists tasks_org_idx on tasks (org_id);
create index if not exists tasks_owner_idx on tasks (owner_id);
