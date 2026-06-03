-- ============================================================================
-- CRM Fase 1 — cadastros principais
-- ============================================================================

create table if not exists platforms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  nome text not null,
  site text,
  observacoes text
);

create table if not exists objections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  titulo text not null,
  categoria text check (categoria in ('Preço','Produto','Timing','Relacionamento','Concorrência','Outro')),
  descricao text
);

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  nome text not null,
  cidade text,
  uf text,
  gmv_anual numeric,
  classificacao text check (classificacao in ('A+','A','B','C')),
  origem_lead text check (origem_lead in ('Indicação','Prospecção ativa','Inbound','Evento','Outro')),
  sociedade text check (sociedade in ('Sócio Único','Grupo de Sócios')),
  estrutura text check (estrutura in ('Pequena','Média','Grande')),
  funil_stage_id uuid references funnel_stages(id),
  bi_organizador text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists organizations_org_idx on organizations (org_id);
create index if not exists organizations_stage_idx on organizations (funil_stage_id);

create table if not exists persons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  nome text not null,
  email text,
  telefone text,
  linkedin text,
  cargo text,
  funil_stage_id uuid references funnel_stages(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists persons_org_idx on persons (org_id);

create table if not exists crm_locals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  nome text not null,
  cidade text,
  uf text,
  capacidade int,
  tipo text check (tipo in ('Casa de show','Teatro','Estádio','Arena','Autódromo','Espaço multiuso','Outro'))
);

create table if not exists artists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  nome text not null,
  genero_id uuid references generos(id),
  escalao text check (escalao in ('Local','Regional','Nacional','Internacional')),
  organization_id uuid references organizations(id)
);
create index if not exists artists_org_idx on artists (org_id);

create table if not exists crm_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  nome text not null,
  data_prevista date,
  local_id uuid references crm_locals(id),
  organization_id uuid references organizations(id),
  capacidade_estimada int,
  gmv_estimado numeric,
  segmento_id uuid references segments(id),
  status text default 'Planejado' check (status in ('Planejado','Confirmado','Cancelado','Realizado')),
  observacoes text,
  bi_event_codigo text,
  created_at timestamptz default now()
);
create index if not exists crm_events_org_idx on crm_events (org_id);
