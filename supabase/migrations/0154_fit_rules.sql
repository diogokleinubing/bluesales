-- Motor de Fit Score (prospecção): regras configuráveis por escopo
-- (local / evento / organizador) e, para locais, por tipo de local.

create table if not exists fit_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  escopo text not null check (escopo in ('local', 'evento', 'organizador')),
  -- null = regra padrão do escopo; preenchido = override por tipo de local.
  tipo_local_id uuid references local_types(id),
  config jsonb not null default '{}',
  ativo boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (org_id, escopo, tipo_local_id)
);

create index if not exists fit_rules_org_idx on fit_rules (org_id);

alter table fit_rules enable row level security;
drop policy if exists fit_rules_all on fit_rules;
create policy fit_rules_all on fit_rules for all to authenticated using (true) with check (true);
