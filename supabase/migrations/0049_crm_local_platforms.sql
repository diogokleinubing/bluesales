-- ============================================================================
-- CRM — relação entre Locais e Plataformas de ingressos.
-- Cada relação tem um tipo: Exclusividade | Homologada.
-- ============================================================================

create table if not exists local_platforms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  local_id uuid not null references crm_locals(id) on delete cascade,
  platform_id uuid not null references platforms(id) on delete cascade,
  tipo_relacao text check (tipo_relacao in ('Exclusividade', 'Homologada')),
  created_at timestamptz default now(),
  unique (local_id, platform_id)
);
create index if not exists local_platforms_local_idx on local_platforms (local_id);

alter table local_platforms enable row level security;
drop policy if exists local_platforms_all on local_platforms;
create policy local_platforms_all on local_platforms
  for all to authenticated using (true) with check (true);
